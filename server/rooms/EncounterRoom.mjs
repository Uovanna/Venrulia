// Realms of Eldoria — authoritative PvE encounter room (Colyseus).
// Ticks the shared game-core (../sim.mjs → ../combat.mjs) as the source of truth and
// broadcasts snapshots. Empty seats are filled with disguised bots, matching the
// client's existing bot policy. Targets Colyseus ^0.15.
//
// STATUS: scaffold. The core currently auto-resolves every combatant (bot AI via the
// game-core). Real-time HUMAN control is the one remaining core extension — see the
// `onMessage("intent")` handler and STAGE-4 note at the bottom.

import { Room } from "colyseus";
import { createRun, stepRun, snapshot } from "../sim.mjs";
import { buildPartyFromSeats, contentById } from "../party.mjs";

const TICK_MS = 120;             // authoritative sim rate (matches client)
const FILL_TIMEOUT_MS = 8000;    // wait for humans, then bot-fill and start (organic, like the client)

export class EncounterRoom extends Room {
  onCreate(options) {
    const content = contentById(options?.contentId);
    if (!content) throw new Error("unknown contentId: " + options?.contentId);
    this.content = content;
    this.maxClients = content.partySize;
    this.seed = (options?.seed ?? ((Math.random() * 2 ** 31) | 0)) >>> 0; // authoritative seed lives on the server
    this.seats = [];         // { sessionId, name, loadout, role, bot }
    this.started = false;
    this.enc = null;

    // lobby metadata clients can read before the fight starts
    this.setState({ phase: "lobby", contentId: content.id, partySize: content.partySize, seed: this.seed });

    // Players send ability intents; validated here (see STAGE-4 note).
    this.onMessage("intent", (client, intent) => {
      const seat = this.seats.find((s) => s.sessionId === client.sessionId);
      if (!seat || !this.started) return;
      // TODO(stage-4): queue this intent for `seat`'s combatant so the next stepRun consumes it.
      // Requires the core to accept per-combatant inputs: stepRun(state, dt, inputs).
      seat.pendingIntent = intent;
    });
  }

  onJoin(client, options) {
    if (this.started) throw new Error("encounter already in progress");
    this.seats.push({
      sessionId: client.sessionId,
      uid: options?.uid || null,
      name: (options?.name || "Adventurer").slice(0, 24),
      loadout: options?.loadout || null,   // { cls, spec, level, power, ... } from pvp_snapshot / client
      role: options?.role || "dps",
      bot: false,
    });
    // Start when full, or after the fill window (bot-filled) once at least one human is in.
    if (this.seats.length >= this.content.partySize) this.start();
    else if (!this._fillTimer) this._fillTimer = this.clock.setTimeout(() => this.start(), FILL_TIMEOUT_MS);
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (this._fillTimer) { this._fillTimer.clear(); this._fillTimer = null; }
    this.lock();

    // Fill remaining seats with bots (disguised: player-style names/loadouts), then build the party.
    const party = buildPartyFromSeats(this.seats, this.content);
    this.enc = createRun({ party, boss: this.content.boss, seed: this.seed });
    this.setState({ ...this.state, phase: "combat" });

    // Authoritative loop — the server is the only place time advances.
    this.setSimulationInterval(() => {
      // TODO(stage-4): fold each seat.pendingIntent into the step (input-driven core).
      this.enc = stepRun(this.enc, TICK_MS);
      this.broadcast("state", snapshot(this.enc));
      if (this.enc.cleared || this.enc.wiped) this.finish();
    }, TICK_MS);
  }

  async finish() {
    if (this._done) return; this._done = true;
    this.setSimulationInterval(undefined);
    const outcome = this.enc.cleared ? "cleared" : "wiped";
    this.broadcast("result", { outcome, tick: this.enc.tick, elapsed: this.enc.elapsed });
    if (outcome === "cleared") {
      try {
        const { grantRewards } = await import("../rewards.mjs");
        await grantRewards(this.content, this.seats.filter((s) => !s.bot), this.enc);
      } catch (e) { console.warn("reward grant failed:", e.message); }
    }
    this.clock.setTimeout(() => this.disconnect(), 4000); // let clients read the result, then dispose
  }

  onLeave(client) {
    const seat = this.seats.find((s) => s.sessionId === client.sessionId);
    if (seat && this.started && !this.enc?.cleared && !this.enc?.wiped) {
      seat.bot = true; // hand a dropped player's slot to a bot mid-fight (Stage-4 uses this for control)
    }
  }
  onDispose() { this.setSimulationInterval(undefined); }
}

/*
STAGE-4 (real-time human control): the current game-core resolves every combatant with its
built-in AI, so this room already runs an authoritative co-op fight that all clients watch live
and whose loot is server-granted. To let humans *act* in real time, extend the core to accept
inputs — stepEncounter(state, dt, inputs) — where `inputs[allyId]` is a queued ability/target.
The room feeds each seat.pendingIntent in; bots keep using chooseAllyAction. Determinism and the
validator are unchanged because inputs become part of the reproducible (state, seed, inputs) tuple.
*/

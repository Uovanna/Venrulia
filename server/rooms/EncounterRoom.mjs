// Realms of Eldoria — authoritative PvE encounter room (Colyseus).
// Ticks the shared game-core (../sim.mjs → ../combat.mjs) as the source of truth and
// broadcasts snapshots. Empty seats are filled with disguised bots, matching the
// client's existing bot policy. Targets Colyseus ^0.15.
//
// Human seats are player-driven: a client sends an `intent` naming one of its own skills,
// the room queues it, and the next authoritative tick consumes it. Empty seats and dropped
// players fall back to the core's AI. Every intent is validated inside the core against the
// character's own loadout, so the wire carries a skill NAME and never a skill object.

// colyseus ^0.15 ships CommonJS, so it has to be default-imported and destructured;
// `import { Room } from "colyseus"` throws at load under Node's ESM loader.
import colyseus from "colyseus";
// @colyseus/schema does ship an ESM build, so it imports by name; `colyseus` itself does not.
import { Schema, defineTypes } from "@colyseus/schema";
import { createRun, stepRun, snapshot } from "../sim.mjs";
import { buildPartyFromSeats, contentById } from "../party.mjs";

const { Room } = colyseus;

// Colyseus encodes room state with @colyseus/schema, so it must be a Schema instance —
// handing setState() a plain object makes the first client's join fail to encode.
// `defineTypes` is the decorator-free form, which is what plain .mjs needs.
// Only lobby metadata lives here; the per-tick fight state goes out as `state` broadcasts.
class EncounterState extends Schema {}
defineTypes(EncounterState, {
  phase: "string",      // "lobby" | "combat" | "done"
  contentId: "string",
  partySize: "uint8",
  seed: "uint32",
});

const TICK_MS = 120;           // authoritative sim rate (matches client)
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
    const state = new EncounterState();
    state.phase = "lobby";
    state.contentId = content.id;
    state.partySize = content.partySize;
    state.seed = this.seed;
    this.setState(state);

    // Players send ability intents. Only the skill NAME and an optional target cross the
    // wire; the core resolves it against that character's own loadout and checks cooldown
    // and resources, so a forged or unaffordable intent is dropped rather than trusted.
    this.onMessage("intent", (client, intent) => {
      const seat = this.seats.find((s) => s.sessionId === client.sessionId);
      if (!seat || !this.started || seat.bot || !seat.allyId) return;   // no seat, not started, or handed to AI
      if (!intent || typeof intent.skillName !== "string") return;
      const target = intent.target && (intent.target.type === "enemy" || intent.target.type === "ally") && typeof intent.target.id === "string"
        ? { type: intent.target.type, id: intent.target.id }
        : null;
      // Last intent before the next tick wins — a player cannot bank actions by spamming.
      seat.pendingIntent = { skillName: intent.skillName, target };
    });
  }

  onJoin(client, options) {
    if (this.started) throw new Error("encounter already in progress");
    // Reject here rather than at start(): buildPartyFromSeats needs a real combatant to seed
    // both the seat and the bot-fill templates, and a throw from the fill timer is uncatchable
    // by Colyseus and takes the process down with it.
    if (!options?.loadout?.char) throw new Error("join requires loadout.char (a combat-ready character)");
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
    // start() runs off the fill timer, where an uncaught throw kills the whole server process —
    // so a party that won't build closes this room only.
    let party;
    try {
      party = buildPartyFromSeats(this.seats, this.content);
    } catch (e) {
      console.warn("encounter start failed:", e.message);
      this.broadcast("error", { message: "could not start encounter: " + e.message });
      this.disconnect();
      return;
    }
    this.enc = createRun({ party, boss: this.content.boss, seed: this.seed });
    this.state.phase = "combat"; // mutate: setState() would swap the encoder out mid-room
    this.timeline = [];          // recorded intents, so the fight can be replayed and validated

    // Tell each player which combatant is theirs and which skills they may name. Without
    // this a client cannot address its own ally or build a legal intent.
    for (const seat of this.seats) {
      if (seat.bot || !seat.allyId) continue;
      const client = this.clients.find((c) => c.sessionId === seat.sessionId);
      if (client) client.send("assigned", { allyId: seat.allyId, skills: (seat.loadout?.char?.selectedSkills || []).slice(0, 6) });
    }

    // Authoritative loop — the server is the only place time advances.
    this.setSimulationInterval(() => {
      // Drain each seat's queued intent into this tick's inputs. Draining (rather than
      // leaving it set) is what makes one tap one action: the core re-queues it internally
      // if the ally is still on GCD.
      let inputs = null;
      for (const seat of this.seats) {
        if (!seat.pendingIntent || seat.bot || !seat.allyId) continue;
        (inputs ||= {})[seat.allyId] = seat.pendingIntent;
        this.timeline.push({ tick: this.enc.tick, allyId: seat.allyId, ...seat.pendingIntent });
        seat.pendingIntent = null;
      }
      this.enc = stepRun(this.enc, TICK_MS, inputs);
      this.broadcast("state", snapshot(this.enc));
      if (this.enc.cleared || this.enc.wiped) this.finish();
    }, TICK_MS);
  }

  async finish() {
    if (this._done) return; this._done = true;
    this.setSimulationInterval(undefined);
    const outcome = this.enc.cleared ? "cleared" : "wiped";
    this.state.phase = "done";
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
      seat.bot = true;
      seat.pendingIntent = null;
      // Hand the combatant itself back to the AI. Clearing isHuman is the part that matters:
      // the core lets a human's turn stay open until they tap, so a dropped player's ally
      // would otherwise stand still for the rest of the fight and stall the party.
      const ally = this.enc?.allies.find((a) => a.id === seat.allyId);
      if (ally) ally.isHuman = false;
    }
  }
  onDispose() { this.setSimulationInterval(undefined); }
}

/*
CLIENT PROTOCOL

  join    joinOrCreate("encounter", { contentId, name, role, uid, loadout: { char, tier } })
          `loadout.char` is required — it seeds the combatant and the bot-fill templates.

  ← assigned  { allyId, skills }   sent once at start; `allyId` is your combatant in every
                                   snapshot, `skills` are the names you may send.
  ← state     snapshot(enc)        every 120ms tick.
  ← result    { outcome, tick, elapsed }
  ← error     { message }

  → intent    { skillName, target?: { type: "enemy"|"ally", id } }
              Names one of your own skills. Target is optional; the core picks a sensible
              one (primary enemy, or the most injured ally for heals). Sending again before
              the next tick replaces the queued intent rather than banking a second action.

The server never trusts a skill object from the wire — resolveIntent looks the name up in the
character's own loadout and applies the same cooldown and resource rules bots obey. Every
applied intent is recorded in `this.timeline`, so verifyEncounter can replay a human-played
fight from (party, boss, seed, timeline) and reproduce it exactly.
*/

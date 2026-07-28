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
import { createRun, stepRun, fullSnapshot } from "../sim.mjs";
import { buildPartyFromSeats, contentById } from "../party.mjs";
import { queueIntent, INTENT_QUEUE_MAX } from "../intents.mjs";
import { auctionForClear, placeBid, passLot, tick, lotView } from "../loot.mjs";
import { logLoadout } from "../loadout-check.mjs";

const { Room } = colyseus;
const seatName = (client, options) => `${(options?.name || "Adventurer")}#${client.sessionId.slice(0, 4)}`;

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

// How long the lobby stays open for other players before empty seats are bot-filled. Eight
// seconds meant two friends had to press Queue within eight seconds of each other or they were
// silently placed in separate rooms — the room locks on start. A minute is long enough to
// coordinate across timezones; a full party still starts instantly.
// Overridable so the e2e test can start a room without waiting a real minute. Production never
// sets it; a single client waiting the full window is the point of the default.
const FILL_TIMEOUT_MS = Number(process.env.ROE_FILL_MS) || 60000;

// How long a dropped player's seat is held for them mid-fight. Long enough to cover a phone
// moving between networks, short enough that a genuinely gone player is not carried by an idle
// combatant — their ally is handed to the AI for the gap either way, so nothing stalls.
const RECONNECT_WINDOW_S = 45;

export class EncounterRoom extends Room {
  onCreate(options) {
    const content = contentById(options?.contentId);
    if (!content) throw new Error("unknown contentId: " + options?.contentId);
    this.content = content;
    this.maxClients = content.partySize;
    this.seed = (options?.seed ?? ((Math.random() * 2 ** 31) | 0)) >>> 0; // authoritative seed lives on the server
    this.code = (options?.code || "").slice(0, 16);   // shared by friends; "" = public matchmaking
    this.seats = [];         // { sessionId, name, loadout, role, bot }
    this.opensAt = Date.now() + FILL_TIMEOUT_MS;
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
      seat.intents = queueIntent(seat.intents, intent);
    });

    // GDKP bids. The room owns the auction, so a bid is a request: it is checked against the
    // bidder's real purse (published on join) and the current high before it counts.
    this.onMessage("bid", (client, msg) => {
      const seat = this.seats.find((s) => s.sessionId === client.sessionId);
      if (!seat || !this.auction || !seat.allyId) return;
      const rej = placeBid(this.auction, seat.allyId, Number(msg && msg.amount) || 0);
      if (rej) { client.send("notice", { code: rej.code, text: rej.text }); return; }
      this.broadcast("loot", { phase: "bidding", lot: lotView(this.auction) });
    });
    this.onMessage("pass", (client) => {
      const seat = this.seats.find((s) => s.sessionId === client.sessionId);
      if (!seat || !this.auction || !seat.allyId) return;
      passLot(this.auction, seat.allyId);
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
      // The purse a bid is checked against. Kept server-side so an inflated bid is refused here
      // rather than trusted from the wire at settle time.
      gold: Math.max(0, Math.floor(Number(options?.gold) || 0)),
      bot: false,
    });
    // The published character is still trusted — this only records what looks out of range, so a
    // testing phase produces the distribution a real validator would need. It rejects nothing.
    logLoadout(options.loadout.char, this.content, seatName(client, options));
    console.log(`[room ${this.roomId}] join ${seatName(client, options)} → ${this.seats.length}/${this.content.partySize} (${this.content.id}${this.code ? ", code " + this.code : ""})`);
    // Start when full, or after the fill window (bot-filled) once at least one human is in.
    if (this.seats.length >= this.content.partySize) this.start();
    else {
      if (!this._fillTimer) this._fillTimer = this.clock.setTimeout(() => this.start(), FILL_TIMEOUT_MS);
      // Broadcast on a ticker rather than only on join. Two reasons: a broadcast issued
      // during onJoin can miss the very client that is joining (it is not receiving yet), so
      // a solo player would sit on "Connecting…" and never see a lobby at all; and the
      // countdown has to actually count down.
      if (!this._lobbyTimer) this._lobbyTimer = this.clock.setInterval(() => this.sendLobby(), 1000);
      this.sendLobby();
    }
  }

  // Waiting players need to know someone else is there, and how long they have.
  sendLobby() {
    this.broadcast("lobby", {
      contentName: this.content.name,
      size: this.content.partySize,
      code: this.code,
      players: this.seats.filter((s) => !s.bot).map((s) => ({ name: s.name, role: s.role })),
      secondsLeft: Math.max(0, Math.round((this.opensAt - Date.now()) / 1000)),
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (this._fillTimer) { this._fillTimer.clear(); this._fillTimer = null; }
    if (this._lobbyTimer) { this._lobbyTimer.clear(); this._lobbyTimer = null; }
    this.lock();

    // Fill remaining seats with bots (disguised: player-style names/loadouts), then build the party.
    // start() runs off the fill timer, where an uncaught throw kills the whole server process —
    // so a party that won't build closes this room only.
    let party;
    try {
      party = buildPartyFromSeats(this.seats, this.content, this.seed);
    } catch (e) {
      console.warn("encounter start failed:", e.message);
      this.broadcast("error", { message: "could not start encounter: " + e.message });
      this.disconnect();
      return;
    }
    console.log(`[room ${this.roomId}] START ${this.content.id} — ${this.seats.filter((s) => !s.bot).length} human(s), ${party.length} total`);
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
        if (seat.bot || !seat.allyId || !seat.intents?.length) continue;
        // One tap per tick, in the order they were pressed — nothing is dropped on the floor.
        const next = seat.intents.shift();
        (inputs ||= {})[seat.allyId] = next;
        this.timeline.push({ tick: this.enc.tick, allyId: seat.allyId, ...next });
      }
      this.enc = stepRun(this.enc, TICK_MS, inputs);
      // Why a tap did nothing goes ONLY to the player it concerns — "not enough Rage" is not
      // party business, and broadcasting it would spam three other people per mistap.
      for (const n of this.enc.notices || []) {
        const seat = this.seats.find((s) => s.allyId === n.allyId && !s.bot);
        const client = seat && this.clients.find((c) => c.sessionId === seat.sessionId);
        if (client) client.send("notice", { code: n.code, text: n.text, skillName: n.skillName || null });
      }
      this.broadcast("state", fullSnapshot(this.enc));
      if (this.enc.cleared || this.enc.wiped) this.finish();
    }, TICK_MS);
  }

  async finish() {
    if (this._done) return; this._done = true;
    this.setSimulationInterval(undefined);
    const outcome = this.enc.cleared ? "cleared" : "wiped";
    this.state.phase = "done";
    this.broadcast("result", { outcome, tick: this.enc.tick, elapsed: this.enc.elapsed });
    // A wipe drops nothing, so there is no auction to run.
    if (outcome !== "cleared") { this.clock.setTimeout(() => this.disconnect(), 4000); return; }
    this.runAuction();
  }

  // GDKP, run by the room. The lots are rolled once from the encounter seed and the bidding is
  // resolved here, so the whole party sees one drop and one auction instead of each client
  // inventing its own.
  runAuction() {
    const { auction, items } = auctionForClear({ content: this.content, enc: this.enc, seats: this.seats, seed: this.seed });
    this.auction = auction;
    this.lootResults = [];
    console.log(`[room ${this.roomId}] LOOT ${items.length} lot(s) → auction open`);
    this.broadcast("loot", { phase: "open", lot: lotView(this.auction) });

    // Drive the auction on the room's SIMULATION interval, not this.clock. finish() clears the
    // simulation interval, and that loop is what ticks the clock — so clock.setInterval callbacks
    // registered afterwards never fire at all. The auction opened and bids registered (both are
    // message-driven) but no lot ever hammered, which looked like the auction hanging.
    this.setSimulationInterval(() => {
      const ev = tick(this.auction);
      if (!ev) return;
      if (ev.kind === "bid") { this.broadcast("loot", { phase: "bidding", lot: ev.lot }); return; }
      // hammered
      this.lootResults.push(ev);
      this.broadcast("loot", {
        phase: "sold", item: ev.item, price: ev.price, winnerId: ev.winnerId,
        winnerName: ev.winnerName, share: ev.share, payouts: ev.payouts,
      });
      if (this.auction.done) { this.setSimulationInterval(undefined); this.settle(); }
      else this.broadcast("loot", { phase: "open", lot: lotView(this.auction) });
    }, 1000);
  }

  async settle() {
    try {
      const { grantRewards } = await import("../rewards.mjs");
      await grantRewards(this.content, this.seats.filter((s) => !s.bot), this.enc, this.lootResults);
    } catch (e) { console.warn("reward grant failed:", e.message); }
    this.broadcast("loot", { phase: "done" });
    this.clock.setTimeout(() => this.disconnect(), 4000); // let clients read the result, then dispose
  }

  async onLeave(client, consented) {
    const seat = this.seats.find((s) => s.sessionId === client.sessionId);
    if (!seat) return;
    if (!this.started) {
      // Left while still forming — free the seat and tell the others.
      this.seats = this.seats.filter((s) => s !== seat);
      this.sendLobby();
      return;
    }
    if (this.enc?.cleared || this.enc?.wiped) return;         // fight already over, nothing to hand over

    // Hand the combatant to the AI immediately so the party is not stalled waiting on someone
    // who may be gone: the core lets a human's turn stay open until they tap, so a dropped
    // player's ally would otherwise stand still for the rest of the fight.
    seat.bot = true;
    seat.intents = [];
    const ally = this.enc?.allies.find((a) => a.id === seat.allyId);
    if (ally) ally.isHuman = false;

    // A phone changing network drops the socket without the player choosing to leave. Handing
    // the seat to a bot permanently meant a two-second blip cost you the rest of the run with no
    // way back, so hold the seat open and take it back if they return.
    if (consented) return;                                    // they pressed Leave; do not hold a seat
    try {
      await this.allowReconnection(client, RECONNECT_WINDOW_S);
      seat.sessionId = client.sessionId;                      // may be re-issued on reconnect
      seat.bot = false;
      const back = this.enc?.allies.find((a) => a.id === seat.allyId);
      if (back && !back.down) back.isHuman = true;             // a downed ally stays AI until resurrected
      console.log(`[room ${this.roomId}] ${seat.name} reconnected → ally ${seat.allyId}`);
      client.send("assigned", { allyId: seat.allyId, skills: (seat.loadout?.char?.selectedSkills || []).slice(0, 6) });
    } catch {
      console.log(`[room ${this.roomId}] ${seat.name} did not return within ${RECONNECT_WINDOW_S}s — ally stays with the AI`);
    }
  }
  onDispose() { this.setSimulationInterval(undefined); if (this._lobbyTimer) this._lobbyTimer.clear(); }
}

/*
CLIENT PROTOCOL

  join    joinOrCreate("encounter", { contentId, name, role, uid, loadout: { char, tier } })
          `loadout.char` is required — it seeds the combatant and the bot-fill templates.

  ← assigned  { allyId, skills }   sent once at start; `allyId` is your combatant in every
                                   snapshot, `skills` are the names you may send.
  ← state     fullSnapshot(enc)    every 120ms tick — whole state minus ally.char.
  ← result    { outcome, tick, elapsed }
  ← error     { message }

  → intent    { skillName, target?: { type: "enemy"|"ally", id } }
              Names one of your own skills. Target is optional; the core picks a sensible
              one (primary enemy, or the most injured ally for heals). Re-sending the SAME
              skill moves it to the back of the queue rather than banking a second action;
              the queue is capped at INTENT_QUEUE_MAX. See ../intents.mjs.
  → intent    { potion: true }
              The one intent that names no skill. It spends a charge belonging to the whole
              encounter, so the core decides whether it is allowed (cap, downed, full HP).
              Mashing it queues one potion, never a stack.
  ← notice    { code, text, skillName? }
              Sent to ONE client: why their last tap did nothing ("Not enough Rage for
              Devastating Blow (12/30)", "on cooldown", "No potions left this fight"). It is
              deliberately not broadcast — a mistap is not party business — and it is absent
              from the state snapshot for the same reason.

The server never trusts a skill object from the wire — resolveIntent looks the name up in the
character's own loadout and applies the same cooldown and resource rules bots obey. Every
applied intent is recorded in `this.timeline`, so verifyEncounter can replay a human-played
fight from (party, boss, seed, timeline) and reproduce it exactly.
*/

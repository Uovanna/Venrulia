// Realms of Eldoria — authoritative server simulation.
// Thin, deterministic wrapper over the shared game-core (combat.mjs). This is the ONE
// place the server advances a fight: a Colyseus room ticks `stepRun`, and the async
// validator replays a whole encounter with `verifyEncounter`. Same code as the client,
// so results are reproducible and cheat-checkable.

import { createEncounter, stepEncounter, resolveIntent } from "./combat.mjs";

export { resolveIntent };

export const DEFAULT_DT = 120;      // ms per tick (matches the client sim)
export const MAX_STEPS = 6000;      // safety cap (~12 min at 120ms) so a stuck fight can't spin forever

// Create the initial authoritative state for an encounter.
// party: [{ char, role, tier }]  (combatants built from stored loadouts / snapshots)
export function createRun({ party, boss, seed, potionCap }) {
  if (!Array.isArray(party) || !party.length) throw new Error("createRun: party required");
  if (!Number.isFinite(seed)) throw new Error("createRun: numeric seed required");
  return createEncounter({ party, boss, seed, potionCap });
}

// Advance one authoritative tick. Pure: returns a new state, never mutates the input.
// `inputs` is this tick's player intents, { [allyId]: { skillName, target? } }. The core
// validates each one against that ally's own loadout, so it is safe to pass straight
// through from the wire.
export function stepRun(state, dt = DEFAULT_DT, inputs) {
  return (state.cleared || state.wiped) ? state : stepEncounter(state, dt, inputs);
}

// Index a recorded input timeline by tick, so a replay can feed each intent back at the
// exact tick it was applied. Entries: { tick, allyId, skillName, target? }.
export function indexTimeline(timeline) {
  const byTick = new Map();
  for (const e of timeline || []) {
    if (!byTick.has(e.tick)) byTick.set(e.tick, {});
    byTick.get(e.tick)[e.allyId] = { skillName: e.skillName, target: e.target };
  }
  return byTick;
}

// Run an encounter to completion (used by the validator and for offline resolution).
// `timeline` replays recorded human intents; omit it for a fully AI-resolved fight.
export function runEncounter({ party, boss, seed, dt = DEFAULT_DT, maxSteps = MAX_STEPS, timeline }) {
  let s = createRun({ party, boss, seed });
  const byTick = indexTimeline(timeline);
  let steps = 0;
  while (!s.cleared && !s.wiped && steps < maxSteps) { s = stepEncounter(s, dt, byTick.get(s.tick)); steps++; }
  return {
    steps,
    outcome: s.cleared ? "cleared" : s.wiped ? "wiped" : "timeout",
    elapsed: s.elapsed,
    survivors: s.allies.filter((a) => !a.down).map((a) => a.id),
    bossHp: s.enemies.map((e) => Math.max(0, Math.round(e.hp))),
    state: s,
  };
}

// Replay validator: re-simulate the exact fight and confirm a client-reported outcome.
// The core is deterministic in (party, boss, seed, inputs), so replaying the recorded
// `timeline` alongside the seed reproduces a human-played fight exactly — which is what
// keeps a player-controlled result as tamper-proof as an AI-resolved one.
export function verifyEncounter({ party, boss, seed, claimed, dt = DEFAULT_DT, maxSteps = MAX_STEPS, timeline }) {
  const r = runEncounter({ party, boss, seed, dt, maxSteps, timeline });
  const valid = !claimed || (
    (claimed.outcome === undefined || claimed.outcome === r.outcome) &&
    (claimed.steps === undefined || claimed.steps === r.steps)
  );
  return { valid, actual: { outcome: r.outcome, steps: r.steps }, claimed: claimed || null };
}

// A compact, serializable snapshot of authoritative state to broadcast to clients each tick.
export function snapshot(state) {
  return {
    tick: state.tick,
    elapsed: state.elapsed,
    cleared: state.cleared,
    wiped: state.wiped,
    allies: state.allies.map((a) => ({ id: a.id, name: a.name, hp: Math.round(a.hp), maxHp: Math.round(a.maxHp), down: !!a.down })),
    enemies: state.enemies.map((e) => ({ id: e.id, name: e.name, hp: Math.round(e.hp), maxHp: Math.round(e.maxHp) })),
    log: state.log.slice(-12),
  };
}

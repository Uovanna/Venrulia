// Realms of Eldoria — authoritative server simulation.
// Thin, deterministic wrapper over the shared game-core (combat.mjs). This is the ONE
// place the server advances a fight: a Colyseus room ticks `stepRun`, and the async
// validator replays a whole encounter with `verifyEncounter`. Same code as the client,
// so results are reproducible and cheat-checkable.

import { createEncounter, stepEncounter } from "./combat.mjs";

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
export function stepRun(state, dt = DEFAULT_DT) {
  return (state.cleared || state.wiped) ? state : stepEncounter(state, dt);
}

// Run an encounter to completion (used by the validator and for offline resolution).
export function runEncounter({ party, boss, seed, dt = DEFAULT_DT, maxSteps = MAX_STEPS }) {
  let s = createRun({ party, boss, seed });
  let steps = 0;
  while (!s.cleared && !s.wiped && steps < maxSteps) { s = stepEncounter(s, dt); steps++; }
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
// Because the core is deterministic in (party, boss, seed), the server is the source of truth.
export function verifyEncounter({ party, boss, seed, claimed, dt = DEFAULT_DT, maxSteps = MAX_STEPS }) {
  const r = runEncounter({ party, boss, seed, dt, maxSteps });
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

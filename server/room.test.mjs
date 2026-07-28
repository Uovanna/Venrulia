// Exercises the room's core path without Colyseus: seats -> party -> authoritative run.
import { readFileSync } from "fs";
import { buildPartyFromSeats, contentById } from "./party.mjs";
import { createRun, stepRun, snapshot } from "./sim.mjs";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/party.json", import.meta.url)));
let fail = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };

// Simulate 1 human seat (brings a loadout.char) + bot-fill to partySize
const content = contentById("deadmines");
ok(!!content, "content resolves (deadmines)");
const seats = [{ sessionId: "s1", uid: "u1", name: "Anvu", role: "tank", loadout: { char: fixture[0].char, tier: fixture[0].tier } }];
const party = buildPartyFromSeats(seats, content);
ok(party.length === content.partySize, `party filled to ${content.partySize} (1 human + ${content.partySize - 1} bots)`);

// Authoritative tick loop (what the room's setSimulationInterval does)
let s = createRun({ party, boss: content.boss, seed: 2024 }), n = 0, last;
while (!s.cleared && !s.wiped && n < 6000) { s = stepRun(s, 120); n++; last = snapshot(s); }
ok(n > 0 && (s.cleared || s.wiped), `room loop resolves in ${n} ticks → ${s.cleared ? "cleared" : "wiped"}`);
ok(last && last.allies.length === content.partySize, "broadcast snapshot well-formed");

// Determinism across two identical rooms
const run = (seed) => { let x = createRun({ party, boss: content.boss, seed }), k = 0; while (!x.cleared && !x.wiped && k < 6000) { x = stepRun(x, 120); k++; } return k + "/" + (x.cleared ? "c" : "w"); };
ok(run(2024) === run(2024), "two rooms, same seed → identical result");

// The PARTY itself must be reproducible, not just the tick loop. buildBotChar rolls bot gear
// through the ambient rng, so an unseeded fill produced a different party — and a different
// fight — from identical inputs. That is what verifyEncounter stands on: it claims a fight
// replays from (party, boss, seed, timeline), which is only true while the party is derivable.
const mkSeats = () => [{ sessionId: "s1", uid: "u1", name: "Anvu", role: "tank",
                         loadout: { char: fixture[0].char, tier: fixture[0].tier } }];
const gearOf = (p) => JSON.stringify(p.map((x) => Object.values(x.char.equipment || {}).map((i) => i && i.name)));
ok(gearOf(buildPartyFromSeats(mkSeats(), content, 4242)) === gearOf(buildPartyFromSeats(mkSeats(), content, 4242)),
   "same seed → byte-identical bot-fill (gear included)");
ok(gearOf(buildPartyFromSeats(mkSeats(), content, 4242)) !== gearOf(buildPartyFromSeats(mkSeats(), content, 777)),
   "a different seed rolls a different party, so the seed is really doing the work");
const runFrom = (seed) => { const p = buildPartyFromSeats(mkSeats(), content, seed);
  let x = createRun({ party: p, boss: content.boss, seed: 4242 }), k = 0;
  while (!x.cleared && !x.wiped && k < 6000) { x = stepRun(x, 120); k++; } return k; };
ok(runFrom(4242) === runFrom(4242), "…so two independently built parties resolve to the same tick count");

console.log(fail ? `\nFAILED (${fail})` : "\n✅ room core path works end-to-end (party build → authoritative resolve → snapshot)");
process.exit(fail ? 1 : 0);

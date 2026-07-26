// Server-core test: authoritative determinism + replay validation. Run: node server/sim.test.mjs
import { readFileSync } from "fs";
import { runEncounter, createRun, stepRun, verifyEncounter, snapshot } from "./sim.mjs";
const party = JSON.parse(readFileSync(new URL("./fixtures/party.json", import.meta.url)));
let fail = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };

// 1) authoritative run is deterministic (same seed → identical outcome/steps)
const a = runEncounter({ party, boss: "ashen", seed: 4242 });
const b = runEncounter({ party, boss: "ashen", seed: 4242 });
ok(a.outcome === b.outcome && a.steps === b.steps && a.elapsed === b.elapsed, `deterministic run (${a.outcome} in ${a.steps} steps, both runs)`);

// 2) different seed → generally different internal trajectory
const c = runEncounter({ party, boss: "ashen", seed: 9001 });
ok(JSON.stringify(a.bossHp) !== JSON.stringify(c.bossHp) || a.steps !== c.steps, "seed changes the fight");

// 3) tick-by-tick (room loop) matches run-to-completion
let s = createRun({ party, boss: "ashen", seed: 4242 }), n = 0;
while (!s.cleared && !s.wiped && n < 6000) { s = stepRun(s, 120); n++; }
ok(n === a.steps && (s.cleared ? "cleared" : "wiped") === a.outcome, "tick loop == runEncounter");

// 4) replay validator: accepts the true outcome, rejects a false claim
ok(verifyEncounter({ party, boss: "ashen", seed: 4242, claimed: { outcome: a.outcome, steps: a.steps } }).valid === true, "validator accepts a truthful result");
ok(verifyEncounter({ party, boss: "ashen", seed: 4242, claimed: { outcome: a.outcome === "cleared" ? "wiped" : "cleared" } }).valid === false, "validator rejects a forged result");

// 5) snapshot is serializable + compact
const snap = snapshot(s); ok(JSON.stringify(snap).length > 0 && Array.isArray(snap.allies), "snapshot serializes for broadcast");

console.log(fail ? `\nFAILED (${fail})` : "\n✅ server core: authoritative, deterministic, replay-validating");
process.exit(fail ? 1 : 0);

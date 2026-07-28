// End-to-end test: boots the real Colyseus server and drives an encounter with a real
// websocket client. This covers what the headless tests structurally cannot — module
// loading, state encoding, and the transport — which is where every boot-fatal bug lives.
//
// Needs dependencies installed (`npm install`), so it is kept out of `npm test`
// (which stays dependency-free). Run it with `npm run test:e2e`.
import { spawn } from "child_process";
import { readFileSync } from "fs";
import { Client } from "colyseus.js";

const PORT = Number(process.env.E2E_PORT) || 2591;
const BASE = `http://127.0.0.1:${PORT}`;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/party.json", import.meta.url), "utf8"));
const me = fixture[0];

const server = spawn(process.execPath, ["index.mjs"], {
  cwd: new URL(".", import.meta.url).pathname,
  // The lobby holds a room open for a full minute so friends can coordinate; that is correct in
  // production and useless here, so shorten it for the test only.
  env: { ...process.env, PORT: String(PORT), ROE_FILL_MS: "1500" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

const fail = (msg) => { console.error("  ✗ " + msg); console.error(serverLog); server.kill(); process.exit(1); };

// Wait for the health endpoint rather than a fixed sleep.
let up = false;
for (let i = 0; i < 60; i++) {
  if (server.exitCode !== null) fail(`server exited early (code ${server.exitCode})`);
  try {
    const r = await fetch(`${BASE}/health`);
    if (r.ok && (await r.json()).ok) { up = true; break; }
  } catch { /* not listening yet */ }
  await new Promise((r) => setTimeout(r, 250));
}
if (!up) fail("server never became healthy");
console.log("  ✓ server boots and /health responds");

const client = new Client(`ws://127.0.0.1:${PORT}`);

// A join with no combatant must be refused at the door — not deferred to the fill timer,
// where the throw would take the process down.
try {
  await client.joinOrCreate("encounter", { contentId: "deadmines", name: "NoLoadout" });
  fail("join without loadout.char was accepted");
} catch (e) {
  if (!/loadout\.char/.test(String(e.message || e))) fail("unexpected rejection: " + e.message);
  console.log("  ✓ join without loadout.char is rejected");
}

const unknown = await client.joinOrCreate("encounter", { contentId: "nope" })
  .then(() => null).catch((e) => String(e.message || e));
if (!unknown) fail("unknown contentId was accepted");
console.log("  ✓ unknown contentId is rejected");

if (!(await fetch(`${BASE}/health`)).ok) fail("server died on a malformed join");
console.log("  ✓ server survives malformed joins");

const room = await client.joinOrCreate("encounter", {
  contentId: "deadmines",
  name: "Tester",
  role: me.role,
  seed: 12345,
  loadout: { char: me.char, tier: me.tier },
});
console.log("  ✓ joined room (bot-filled after the fill window)");

let snaps = 0, last = null;
room.onMessage("state", (s) => { snaps++; last = s; });

// The room tells each player which combatant is theirs and which skills it may name.
// Without this a client cannot address its own ally or build a legal intent.
const assigned = await new Promise((resolve) => {
  room.onMessage("assigned", resolve);
  setTimeout(() => resolve(null), 20000);   // sent at start(), i.e. after the fill window
});
if (!assigned) fail("never received the `assigned` message");
if (assigned.allyId !== "a0") fail(`expected allyId a0, got ${assigned.allyId}`);
if (!Array.isArray(assigned.skills) || !assigned.skills.length) fail("assigned carried no skills");
console.log(`  ✓ assigned ally ${assigned.allyId} with ${assigned.skills.length} skills`);

// Drive the combatant over the wire. Outcome-sensitivity of inputs is asserted in
// input.test.mjs against a mixed party; here the point is that the protocol round-trips
// and that a forged skill name cannot crash or hijack the room.
// A rejected intent should come back as a private `notice` explaining itself — the forged name
// below is exactly the case. Collect them so the wire delivery is asserted, not just assumed.
const notices = [];
room.onMessage("notice", (n) => notices.push(n));

let sent = 0;
const spam = setInterval(() => {
  room.send("intent", { skillName: assigned.skills[sent % assigned.skills.length], target: { type: "enemy", id: "e0" } });
  room.send("intent", { skillName: "Kill Everything Instantly" });   // must be ignored, not fatal
  if (sent === 3) room.send("intent", { potion: true });             // the intent that names no skill
  sent++;
}, 600);

const result = await new Promise((resolve, reject) => {
  room.onMessage("result", resolve);
  room.onError((code, message) => reject(new Error(`room error ${code}: ${message}`)));
  setTimeout(() => reject(new Error("timed out waiting for result")), 90000);
}).catch((e) => fail(e.message));
clearInterval(spam);

if (sent < 2) fail(`expected to send several intents, sent ${sent}`);
console.log(`  ✓ ${sent} intent rounds sent (each with one forged skill name mixed in)`);
if (!(await fetch(`${BASE}/health`)).ok) fail("server died while handling intents");
console.log("  ✓ server survived forged intents");

// The forged name above must produce a private explanation, not silence. This is the only place
// the notice path is exercised over a real socket rather than against the sim directly.
if (!notices.length) fail("forged intents produced no `notice` — the player would see a dead button");
if (!notices.some((n) => n.code === "unknown")) fail(`no 'unknown' notice; got ${notices.map((n) => n.code).join(", ")}`);
console.log(`  ✓ ${notices.length} notices delivered privately (codes: ${[...new Set(notices.map((n) => n.code))].join(", ")})`);
if (last.potionsUsed !== 1) fail(`the potion intent did not resolve server-side (potionsUsed=${last.potionsUsed})`);
console.log("  ✓ a { potion: true } intent was honoured over the wire");

if (!snaps) fail("no snapshots were broadcast");
for (const k of ["tick", "elapsed", "cleared", "wiped", "allies", "enemies"]) {
  if (!(k in last)) fail(`snapshot missing "${k}"`);
}
console.log(`  ✓ ${snaps} snapshots broadcast over the wire`);
if (!result.outcome) fail("result missing outcome");
if (!["cleared", "wiped"].includes(result.outcome) || !(result.tick > 0)) {
  fail(`implausible result: ${JSON.stringify(result)}`);
}
console.log(`  ✓ fight resolved (${result.outcome} @ tick ${result.tick})`);

// Transport fidelity. The run above can't be compared to a fixed number — its intents are sent
// on a wall-clock timer, so which tick each lands on varies. Instead run a second room with the
// same seed and NO intents, which is exactly reproducible, and check it against a headless
// replay of the same party. That is the real claim: the wire does not perturb the simulation.
const { buildPartyFromSeats, contentById } = await import("./party.mjs");
const { runEncounter } = await import("./sim.mjs");
const content = contentById("deadmines");
const seats = [{ sessionId: "x", name: "Quiet", role: me.role, bot: false, loadout: { char: me.char, tier: me.tier } }];
const expected = runEncounter({ party: buildPartyFromSeats(seats, content), boss: content.boss, seed: 4242 });

const quietRoom = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate("encounter", {
  contentId: "deadmines", name: "Quiet", role: me.role, seed: 4242, loadout: { char: me.char, tier: me.tier },
});
// This room is driven by nobody, so its human ally never acts and three bots carry the fight —
// it takes far longer in ticks than the played room above (~1800 vs ~380). The room runs in real
// time at TICK_MS, so the wait has to be derived from the replay rather than guessed: a flat 90s
// used to fail here for no reason other than arithmetic.
const quietBudgetMs = expected.steps * 120 + 30000;
console.log(`  … un-driven replay is ${expected.steps} ticks; allowing ${Math.round(quietBudgetMs / 1000)}s of wall clock`);
const quiet = await new Promise((resolve, reject) => {
  quietRoom.onMessage("result", resolve);
  setTimeout(() => reject(new Error(`timed out waiting for the quiet room (${Math.round(quietBudgetMs / 1000)}s)`)), quietBudgetMs);
}).catch((e) => fail(e.message));
if (quiet.tick !== expected.steps || quiet.outcome !== expected.outcome) {
  // Check the premise before blaming the wire. buildPartyFromSeats fills empty seats with bots
  // whose GEAR is rolled through the ambient rng — unseeded — so the server process and this one
  // build different parties from identical inputs and the fight legitimately differs. That is a
  // real defect (it also undermines verifyEncounter, which claims a fight is reproducible from
  // party/boss/seed/timeline), but it is NOT the transport, and reporting it as such would send
  // the next person hunting the wrong bug.
  const again = runEncounter({ party: buildPartyFromSeats(seats, content), boss: content.boss, seed: 4242 });
  if (again.steps !== expected.steps) {
    fail(`bot-fill is not reproducible: two headless builds of the SAME party gave ${expected.steps} and ${again.steps} ticks, `
       + `so the room's ${quiet.tick} says nothing about the wire. Seed the bot-fill in buildPartyFromSeats `
       + `(withRng(makeRng(seed), …)) before trusting this check — or verifyEncounter.`);
  }
  fail(`transport perturbed the sim: room ${quiet.outcome}@${quiet.tick} vs headless ${expected.outcome}@${expected.steps}`);
}
console.log(`  ✓ an un-driven room matches the headless replay exactly (${quiet.outcome} @ tick ${quiet.tick})`);

server.kill();
console.log("\n✅ e2e: real Colyseus client drove an authoritative fight to completion");

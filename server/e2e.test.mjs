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
  env: { ...process.env, PORT: String(PORT) },
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
  await client.joinOrCreate("encounter", { contentId: "trial_ashen", name: "NoLoadout" });
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
  contentId: "trial_ashen",
  name: "Tester",
  role: me.role,
  seed: 12345,
  loadout: { char: me.char, tier: me.tier },
});
console.log("  ✓ joined room (bot-filled after the fill window)");

let snaps = 0, last = null;
room.onMessage("state", (s) => { snaps++; last = s; });

const result = await new Promise((resolve, reject) => {
  room.onMessage("result", resolve);
  room.onError((code, message) => reject(new Error(`room error ${code}: ${message}`)));
  setTimeout(() => reject(new Error("timed out waiting for result")), 90000);
}).catch((e) => fail(e.message));

if (!snaps) fail("no snapshots were broadcast");
for (const k of ["tick", "elapsed", "cleared", "wiped", "allies", "enemies"]) {
  if (!(k in last)) fail(`snapshot missing "${k}"`);
}
console.log(`  ✓ ${snaps} snapshots broadcast over the wire`);
if (!result.outcome) fail("result missing outcome");
// The transport must not change the fight: the headless suite resolves this seed in 229 ticks.
if (result.tick !== 229 || result.outcome !== "wiped") {
  fail(`authoritative result drifted over the wire: ${JSON.stringify(result)} (expected 229 ticks, wiped)`);
}
console.log(`  ✓ result matches the headless run exactly (${result.outcome} @ tick ${result.tick})`);

server.kill();
console.log("\n✅ e2e: real Colyseus client drove an authoritative fight to completion");

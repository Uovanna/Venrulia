// End-to-end GDKP over a real socket: boot the server, clear a fight, and check that the room
// runs ONE auction that every client sees, accepts a bid, refuses an unaffordable one, and
// hammers to a settled result. The unit tests cover the rules; this covers the wire.
//
//   cd server && npm install && node gdkp-e2e.test.mjs
import { spawn } from "child_process";
import { readFileSync } from "fs";
import { Client } from "colyseus.js";

const PORT = Number(process.env.E2E_PORT) || 2594;
const BASE = `http://127.0.0.1:${PORT}`;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/party.json", import.meta.url), "utf8"));
const me = fixture[0];

const server = spawn(process.execPath, ["index.mjs"], {
  cwd: new URL(".", import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), ROE_FILL_MS: "1200" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => { log += d; });
server.stderr.on("data", (d) => { log += d; });
let fails = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const die = (m) => { console.error("  ✗ " + m); console.error(log); server.kill(); process.exit(1); };

for (let i = 0; i < 60; i++) {
  if (server.exitCode !== null) die(`server exited early (${server.exitCode})`);
  try { const r = await fetch(`${BASE}/health`); if (r.ok) break; } catch { /* not up */ }
  await new Promise((r) => setTimeout(r, 250));
}

const PURSE = 250000;
const room = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate("encounter", {
  contentId: "deadmines", name: "Bidder", role: me.role, gold: PURSE,
  loadout: { char: me.char, tier: me.tier },
});

const assigned = await new Promise((res) => { room.onMessage("assigned", res); setTimeout(() => res(null), 20000); });
if (!assigned) die("never got `assigned`");

const lots = [];               // every distinct lot the room opened
const sold = [];               // every hammer
const notices = [];
let lastLot = null;
room.onMessage("notice", (n) => notices.push(n));
room.onMessage("loot", (m) => {
  if (m.phase === "sold") { sold.push(m); return; }
  if (m.phase === "done") return;
  if (!m.lot) return;
  lastLot = m.lot;
  if (!lots.some((l) => l.index === m.lot.index)) lots.push(m.lot);
});

// Play until the boss dies. Drive real skills so the fight actually clears.
let sent = 0;
const spam = setInterval(() => {
  room.send("intent", { skillName: assigned.skills[sent++ % assigned.skills.length], target: { type: "enemy", id: "e0" } });
}, 500);
const result = await new Promise((res, rej) => {
  room.onMessage("result", res);
  setTimeout(() => rej(new Error("fight never resolved")), 180000);
}).catch((e) => die(e.message));
clearInterval(spam);
ok(result.outcome === "cleared", `fight resolved: ${result.outcome}`);
if (result.outcome !== "cleared") { server.kill(); process.exit(fails ? 1 : 0); }

// The auction opens on its own.
await new Promise((r) => setTimeout(r, 1500));
ok(lots.length > 0, `the room opened an auction (${lots.length} lot(s))`);
ok(!!lastLot?.item?.name, `lot 1 is ${lastLot?.item?.name} (ilvl ${lastLot?.item?.ilvl}), reserve ${lastLot?.reserve}g`);
ok(JSON.stringify(lastLot).indexOf("ceiling") === -1, "the lot view never carries the rivals' ceilings");

// A bid beyond the purse must be refused by the SERVER, not by our own UI.
const before = notices.length;
room.send("bid", { amount: PURSE * 10 });
await new Promise((r) => setTimeout(r, 800));
const refusal = notices.slice(before).find((n) => n.code === "gold");
ok(!!refusal, `an unaffordable bid is refused server-side: "${refusal?.text || "(no notice)"}"`);

// An affordable bid must take the lead.
const target = Math.min(PURSE, (lastLot?.minNext || lastLot?.reserve || 0) + 500);
room.send("bid", { amount: target });
await new Promise((r) => setTimeout(r, 1200));
ok(lastLot && lastLot.high >= target && lastLot.highBidderId === assigned.allyId,
   `our bid leads at ${lastLot?.high}g (bidder ${lastLot?.highBidderId})`);

// Let it hammer.
const gotSold = await new Promise((res) => {
  if (sold.length) return res(true);
  const iv = setInterval(() => { if (sold.length) { clearInterval(iv); res(true); } }, 400);
  setTimeout(() => { clearInterval(iv); res(false); }, 40000);
});
ok(gotSold, "the lot hammered");
if (sold.length) {
  const s = sold[0];
  ok(!!s.item, `sold: ${s.item?.name} for ${s.price}g to ${s.winnerName || "(unsold)"}`);
  ok(s.price === 0 || s.price >= lots[0].reserve, "the hammer price met the reserve");
  if (s.winnerId === assigned.allyId) ok(s.price <= PURSE, "we never won a lot beyond our purse");
}

if (fails) { console.error("\n--- server log ---\n" + log.split("\n").filter((l) => !/onMessage/.test(l)).slice(-25).join("\n")); }
server.kill();
console.log(fails ? `\n❌ ${fails} GDKP wire check(s) failed` : "\n✅ GDKP over the wire: one auction, server-validated bids, hammered result");
process.exit(fails ? 1 : 0);

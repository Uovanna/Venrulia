// Server side of potion + rejected-intent feedback: the seat intent queue (including the potion,
// which names no skill) and the per-tick notices the room routes back to one player.
import { readFileSync } from "fs";
import { queueIntent, INTENT_QUEUE_MAX } from "./intents.mjs";
import { buildPartyFromSeats, contentById } from "./party.mjs";
import { createRun, stepRun, fullSnapshot } from "./sim.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/party.json", import.meta.url)));
let fail = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };

// --- intent queue --------------------------------------------------------------------------
{
  let q = [];
  q = queueIntent(q, { skillName: "Power Strike" });
  q = queueIntent(q, { skillName: "Lacerate" });
  ok(q.length === 2 && q[0].skillName === "Power Strike", "two different taps both queue, in order");

  q = queueIntent(q, { skillName: "Power Strike" });
  ok(q.length === 2 && q[1].skillName === "Power Strike",
     "re-tapping the same skill moves it to the back rather than stacking duplicates");

  let big = [];
  for (const n of ["a", "b", "c", "d", "e"]) big = queueIntent(big, { skillName: n });
  ok(big.length === INTENT_QUEUE_MAX, `the queue is capped at ${INTENT_QUEUE_MAX}`);
  ok(big[big.length - 1].skillName === "e", "…keeping the most recent taps");

  ok(queueIntent([], { skillName: "X", target: { type: "enemy", id: "e0" } })[0].target.id === "e0",
     "a well-formed target survives");
  ok(queueIntent([], { skillName: "X", target: { type: "bogus", id: 7 } })[0].target === null,
     "a malformed target is dropped, not trusted");
  ok(queueIntent([{ skillName: "keep" }], null).length === 1, "a malformed intent leaves the queue alone");
  ok(queueIntent([{ skillName: "keep" }], { potion: "yes" }).length === 1,
     "potion must be exactly true — a truthy string is not a potion");
}
// --- the potion is an intent that names no skill ---------------------------------------------
{
  let q = queueIntent([], { potion: true });
  ok(q.length === 1 && q[0].potion === true, "a potion queues");
  q = queueIntent(q, { potion: true });
  q = queueIntent(q, { potion: true });
  ok(q.filter((x) => x.potion).length === 1, "mashing the potion queues ONE, never a stack of charges");

  q = queueIntent(queueIntent([], { skillName: "Power Strike" }), { potion: true });
  ok(q.length === 2, "a potion does not evict a queued skill");
}

// --- notices come out of a real authoritative run ----------------------------------------------
{
  const content = contentById("deadmines");
  const seats = [{ sessionId: "s1", uid: "u1", name: "Anvu", role: "tank",
                   loadout: { char: fixture[0].char, tier: fixture[0].tier } }];
  const party = buildPartyFromSeats(seats, content);
  let enc = createRun({ party, boss: content.boss, seed: 99 });
  const meId = enc.allies.find((a) => a.isHuman).id;

  const forged = stepRun(enc, 120, { [meId]: { skillName: "Definitely Not A Skill" } });
  const n = (forged.notices || [])[0];
  ok(!!n, "a forged skill produces a notice rather than silence");
  ok(n && n.allyId === meId, "the notice is addressed to the ally that sent it (so the room can route it)");
  ok(n && n.code === "unknown", "…and says the skill is not on the bar");

  // the snapshot clients receive must NOT carry another player's notices
  ok(fullSnapshot(forged).notices === undefined,
     "notices are absent from the broadcast snapshot — they are sent privately, not to the party");

  // a potion through the authoritative path
  let hurt = { ...forged, allies: forged.allies.map((a) => a.id === meId ? { ...a, hp: Math.round(a.maxHp * 0.4) } : a) };
  const before = hurt.allies.find((a) => a.id === meId).hp;
  const drank = stepRun(hurt, 120, { [meId]: { potion: true } });
  ok(drank.potionsUsed === 1, "the potion spends an encounter charge server-side");
  ok(drank.allies.find((a) => a.id === meId).hp > before, "…and heals the player who asked");
  ok((drank.notices || []).length === 0, "a successful potion says nothing");

  const capped = stepRun({ ...drank, potionsUsed: drank.potionCap }, 120, { [meId]: { potion: true } });
  ok((capped.notices || []).some((x) => x.code === "nopotions" && x.allyId === meId),
     "past the cap the asking player is told why");
}

console.log(fail ? `\n❌ ${fail} server feedback check(s) failed` : "\n✅ server: intent queue + potion + notice routing");
process.exit(fail ? 1 : 0);

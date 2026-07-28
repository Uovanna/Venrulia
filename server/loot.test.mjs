// Server-authoritative GDKP rules: one lot list for the whole room, bids validated against the
// bidder's real purse, and a payout that adds up.
import { createAuction, placeBid, passLot, tick, currentLot, lotView, BID_SECONDS, MIN_RAISE } from "./loot.mjs";
import { rollGuildLoot } from "./combat.mjs";

let fail = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fail++; };

const items = rollGuildLoot({ ilvl: 66, count: 1, clsIds: ["rogue"], seed: 7 });
const mk = (over = {}) => createAuction({
  items,
  bidders: [
    { id: "a0", name: "You", power: 4000, bot: false, gold: 50000 },
    { id: "a1", name: "Bot1", power: 4000, bot: true },
    { id: "a2", name: "Bot2", power: 4000, bot: true },
    { id: "a3", name: "Poor", power: 4000, bot: false, gold: 10 },
  ],
  seed: 1234, ...over,
});

// --- the lot list is shared, not per-player ---------------------------------------------------
{
  const l1 = rollGuildLoot({ ilvl: 66, count: 2, clsIds: ["rogue", "mage"], seed: 42 });
  const l2 = rollGuildLoot({ ilvl: 66, count: 2, clsIds: ["rogue", "mage"], seed: 42 });
  const strip = (x) => JSON.stringify(x.map(({ id, ...r }) => r));   // uid is not seeded, content is
  ok(strip(l1) === strip(l2), "the same seed rolls the same lots — every client sees one drop");
  ok(strip(l1) !== strip(rollGuildLoot({ ilvl: 66, count: 2, clsIds: ["rogue", "mage"], seed: 43 })),
     "a different seed rolls different lots");
}

// --- bidding rules -----------------------------------------------------------------------------
{
  const a = mk();
  const lot = currentLot(a);
  ok(lot.high === 0 && lot.reserve > 0, `a lot opens unsold at a ${lot.reserve}g reserve`);

  ok(placeBid(a, "a0", 1) === null, "an opening bid below the reserve is lifted TO the reserve");
  ok(currentLot(a).high === lot.reserve, `…so the high is the reserve (${lot.reserve}g)`);

  const dup = placeBid(a, "a0", lot.reserve + 500);
  ok(dup && dup.code === "already", "you cannot bid against yourself");

  const poor = placeBid(a, "a3", 999999);
  ok(poor && poor.code === "gold", `a bid beyond your purse is refused: "${poor && poor.text}"`);
  ok(currentLot(a).highBidder === "a0", "…and does not change the high bidder");

  const ghost = placeBid(a, "zz", 100000);
  ok(ghost && ghost.code === "noseat", "someone not in the run cannot bid at all");

  passLot(a, "a3");
  ok(placeBid(a, "a3", 100000)?.code === "passed", "passing takes you out of the bidding");
}

// --- the view never leaks a rival's ceiling ------------------------------------------------------
{
  const a = mk();
  const v = lotView(a);
  ok(v && v.item && typeof v.reserve === "number", "the client view carries the item and reserve");
  ok(JSON.stringify(v).indexOf("ceiling") === -1, "…and never the bots' ceilings");
  ok(v.secondsLeft === BID_SECONDS, `the clock starts at ${BID_SECONDS}s`);
}

// --- a late bid extends the clock rather than losing to it ------------------------------------------
{
  const a = mk();
  for (let i = 0; i < BID_SECONDS - 1; i++) tick(a);
  const before = currentLot(a).secondsLeft;
  placeBid(a, "a0", 999);
  ok(currentLot(a).secondsLeft > before, `sniping at ${before}s pushes the clock back up`);
}

// --- resolution: the winner pays, everyone else splits the pot ----------------------------------
{
  const a = mk();
  placeBid(a, "a0", 5000);
  let res = null;
  for (let i = 0; i < BID_SECONDS + 5 && !res; i++) { const e = tick(a); if (e && e.kind === "result") res = e; }
  ok(!!res, "the lot hammers when the clock runs out");
  if (res) {
    const winner = a.bidders.find((b) => b.id === res.winnerId);
    ok(!!res.winnerName, `sold to ${res.winnerName} for ${res.price}g`);
    ok(res.price >= currentLotReserve(), "…at or above the reserve");
    const paidOut = Object.values(res.payouts).reduce((s, n) => s + n, 0);
    ok(paidOut <= res.price, `the pot paid out (${paidOut}g) never exceeds the hammer price (${res.price}g)`);
    ok(res.share === Math.floor(res.price / 4), "each non-winner gets an equal share of the price");
    if (winner && !winner.bot) ok(winner.gold === 50000 - res.price, "the winning human's gold is debited by exactly the price");
  }
  ok(a.done, "with one lot, the auction is finished");
}
function currentLotReserve() { const a = mk(); return currentLot(a).reserve; }

// --- an unsold lot pays nobody -------------------------------------------------------------------
{
  // every bidder is broke or a bot with no ceiling: force it by passing everyone
  const a = createAuction({ items, bidders: [
    { id: "a0", name: "You", power: 1, bot: false, gold: 0 },
    { id: "a1", name: "Skint", power: 1, bot: false, gold: 0 },
  ], seed: 5 });
  let res = null;
  for (let i = 0; i < BID_SECONDS + 5 && !res; i++) { const e = tick(a); if (e && e.kind === "result") res = e; }
  ok(res && res.winnerId === null && res.price === 0, "a lot nobody could afford goes unsold");
  ok(res && Object.values(res.payouts).every((v) => v === 0), "…and pays out nothing");
}

// --- settlement: what actually reaches the mailbox ------------------------------------------------
{
  const { buildRewardRows, rewardGold } = await import("./rewards.mjs");
  const content = { id: "deadmines", name: "The Sunken Mine", level: 17, kind: "dungeon" };
  const enc = { cleared: true };
  const seats = [
    { uid: "u0", name: "You", allyId: "a0" },
    { uid: "u1", name: "Mate", allyId: "a1" },
    { uid: null, name: "Guest", allyId: "a2" },
  ];
  const results = [{ item: { name: "Big Sword" }, price: 4000, winnerId: "a0", share: 1000,
                     payouts: { a1: 1000, a2: 1000, a3: 1000 } }];
  const rows = buildRewardRows(content, seats, enc, results);
  ok(rows.length === 2, "a signed-out player gets no mail row");
  const mine = rows.find((r) => r.user_id === "u0"), theirs = rows.find((r) => r.user_id === "u1");
  const clear = rewardGold(content, enc);
  ok(mine.payload.items.length === 1 && mine.payload.items[0].name === "Big Sword", "the winner is mailed the item");
  ok(mine.payload.gold === clear - 4000, `the winner is debited the hammer price (${clear} - 4000 = ${mine.payload.gold})`);
  ok(theirs.payload.gold === clear + 1000 && !theirs.payload.items.length, "everyone else is mailed their share and no item");
  ok(rewardGold({ level: 72, kind: "hard-raid" }, enc) > rewardGold(content, enc),
     "a hard raid now pays more than a level-17 dungeon (the old flat rate paid it less)");
  ok(rewardGold(content, { cleared: false }) === 0, "a wipe pays nothing");
}

console.log(fail ? `\n❌ ${fail} loot check(s) failed` : "\n✅ server-authoritative GDKP: shared lots, validated bids, balanced payout");
process.exit(fail ? 1 : 0);

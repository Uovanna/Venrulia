// Server-authoritative GDKP.
//
// Loot used to be rolled on each client at the moment of a clear, so four players in the same run
// each generated their own item and ran their own auction against simulated rivals — four
// different "drops", four independent bids, no shared truth. The lot list, the bidding and the
// payout now all happen here; clients render what the room tells them and send bids.
//
// Pure and framework-free so it can be tested without Colyseus: the room owns the clock and calls
// tick() on an interval, this owns the rules.
import { rollGuildLoot, gdkpReserve, gdkpBotCeiling } from "./combat.mjs";
import { withRng, makeRng, rngPick, rng } from "./rng.mjs";

export const BID_SECONDS = 15;        // per lot, matching the offline auction
export const MIN_RAISE = 20;          // gold; also the opening step above the reserve
export const EXTEND_TO = 4;           // a late bid pushes the clock back up to this many seconds

// bidders: [{ id, name, power, bot, gold }] — `gold` caps a human's bid; bots use a rolled ceiling.
export function createAuction({ items, bidders, seed }) {
  return withRng(makeRng((seed >>> 0) || 1), () => ({
    lots: (items || []).map((item) => ({
      item,
      reserve: gdkpReserve(item),
      // Every rival's ceiling is rolled up front and never re-rolled, so a bot cannot be nudged
      // into bidding more by a human bidding faster.
      ceilings: Object.fromEntries((bidders || []).filter((b) => b.bot)
        .map((b) => [b.id, gdkpBotCeiling(gdkpReserve(item), b.power)])),
      high: 0, highBidder: null, secondsLeft: BID_SECONDS, resolved: false, passed: {},
    })),
    bidders: (bidders || []).map((b) => ({ ...b })),
    idx: 0,
    done: (items || []).length === 0,
  }));
}

export const currentLot = (a) => (a && !a.done ? a.lots[a.idx] || null : null);

// A human bid. Returns null when accepted, or a reason it was refused — the same shape the
// combat notices use, so the client can surface it the same way.
export function placeBid(a, bidderId, amount) {
  const lot = currentLot(a);
  if (!lot || lot.resolved) return { code: "closed", text: "Bidding on this lot has closed" };
  const bidder = a.bidders.find((b) => b.id === bidderId);
  if (!bidder) return { code: "noseat", text: "You are not in this run" };
  if (lot.passed[bidderId]) return { code: "passed", text: "You passed on this lot" };
  const floor = lot.high > 0 ? lot.high + MIN_RAISE : lot.reserve;
  const amt = Math.max(floor, Math.floor(amount || 0));
  if (amt > (bidder.gold || 0)) return { code: "gold", text: `Not enough gold — you have ${bidder.gold || 0}g` };
  if (lot.highBidder === bidderId) return { code: "already", text: "You are already the high bidder" };
  lot.high = amt;
  lot.highBidder = bidderId;
  lot.secondsLeft = Math.max(lot.secondsLeft, EXTEND_TO);   // sniping just extends the clock
  return null;
}

// Stepping out keeps you in the room until the hammer falls, so your cut is a share of the FINAL
// price rather than an early one.
export function passLot(a, bidderId) {
  const lot = currentLot(a);
  if (lot && !lot.resolved) lot.passed[bidderId] = true;
}

// One second of auction. Bots may raise, then the clock ticks; at zero the lot is hammered.
// Returns an event describing what changed, or null.
export function tick(a) {
  const lot = currentLot(a);
  if (!lot || lot.resolved) return null;

  const floor = lot.high > 0 ? lot.high + MIN_RAISE : lot.reserve;
  const eligible = a.bidders.filter((b) => b.bot && !lot.passed[b.id] && b.id !== lot.highBidder
                                        && (lot.ceilings[b.id] || 0) >= floor);
  if (eligible.length && rng() < 0.5) {
    const b = rngPick(eligible);
    const raise = lot.high > 0 ? lot.high + Math.round(MIN_RAISE + rng() * Math.max(MIN_RAISE, lot.high * 0.25)) : floor;
    lot.high = Math.min(raise, lot.ceilings[b.id]);
    lot.highBidder = b.id;
    lot.secondsLeft = Math.max(lot.secondsLeft, EXTEND_TO);
  }

  lot.secondsLeft -= 1;
  if (lot.secondsLeft > 0) return { kind: "bid", lot: lotView(a, lot) };
  return hammer(a, lot);
}

// Close the lot: the winner pays, everyone else splits the pot. A lot nobody bid on is simply
// unsold — no payout, no item, which is what an unmet reserve means.
function hammer(a, lot) {
  lot.resolved = true;
  const winner = lot.highBidder ? a.bidders.find((b) => b.id === lot.highBidder) : null;
  const others = a.bidders.filter((b) => b.id !== (winner && winner.id));
  const share = winner && others.length ? Math.floor(lot.high / a.bidders.length) : 0;
  if (winner) winner.gold = Math.max(0, (winner.gold || 0) - lot.high);
  for (const b of others) b.gold = (b.gold || 0) + share;

  const result = {
    kind: "result",
    item: lot.item,
    price: lot.high,
    winnerId: winner ? winner.id : null,
    winnerName: winner ? winner.name : null,
    share,
    payouts: Object.fromEntries(others.map((b) => [b.id, share])),
  };
  a.idx += 1;
  if (a.idx >= a.lots.length) a.done = true;
  return result;
}

// What clients are allowed to see: never the rivals' ceilings.
export const lotView = (a, lot) => {
  const l = lot || currentLot(a);
  if (!l) return null;
  const hb = l.highBidder ? a.bidders.find((b) => b.id === l.highBidder) : null;
  return {
    index: a.idx, total: a.lots.length, item: l.item, reserve: l.reserve,
    high: l.high, highBidderId: l.highBidder, highBidderName: hb ? hb.name : null,
    secondsLeft: l.secondsLeft, minNext: l.high > 0 ? l.high + MIN_RAISE : l.reserve,
  };
};

// Convenience for the room: build the auction straight from an encounter + content.
export function auctionForClear({ content, enc, seats, seed }) {
  const clsIds = (enc.allies || []).map((a) => a.char && a.char.cls).filter(Boolean);
  const items = rollGuildLoot({
    ilvl: content.ilvl || 64,
    count: (content.kind || "").includes("raid") ? 2 : 1,
    clsIds,
    seed: (seed >>> 0) ^ 0x9e3779b9,          // a different stream from the fight itself
  });
  const bidders = (enc.allies || []).map((ally, i) => {
    const seat = (seats || []).find((s) => s.allyId === ally.id && !s.bot);
    return {
      id: ally.id,
      name: seat ? seat.name : ally.name,
      power: (ally.char && ally.char.power) || 3000,
      bot: !seat,
      // A human's ceiling is their real purse; the client sends it on join and the room keeps it
      // here so a bid can be refused server-side rather than trusted.
      gold: seat ? (seat.gold || 0) : Number.MAX_SAFE_INTEGER,
    };
  });
  return { auction: createAuction({ items, bidders, seed: (seed >>> 0) ^ 0x85ebca6b }), items };
}

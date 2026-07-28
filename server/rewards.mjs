// Persist encounter rewards through the existing economy (Supabase). The realtime server
// awards loot/gold, then hands it to the async source of truth so it lands in the player's
// mailbox — the bridge that ties Colyseus back to the AH/mail system.
//
// Uses the SERVICE ROLE key (server-only, never shipped to clients) so it can write mail
// on a player's behalf. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE in the environment.

import { createClient } from "@supabase/supabase-js";

let _sb = null;
function sb() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) { console.warn("rewards: SUPABASE_URL / SUPABASE_SERVICE_ROLE not set — skipping persistence"); return null; }
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

// Build every mail row a cleared run owes, without touching the network. Kept separate from the
// insert so the payout arithmetic is testable — this is real player currency.
//
// content: the encounter def
// humanSeats: [{ uid, name, allyId }]
// enc: final authoritative state
// lootResults: [{ item, price, winnerId, share, payouts }] from the room's GDKP auction
export function buildRewardRows(content, humanSeats, enc, lootResults = []) {
  const rows = [];
  const clearGold = rewardGold(content, enc);
  for (const seat of humanSeats) {
    if (!seat.uid) continue;                       // signed-out players get nothing persisted
    // The clear payment, plus every share taken from lots this player did NOT win, minus what
    // they paid for the ones they did. One mail per player keeps the mailbox readable.
    let gold = clearGold;
    const won = [];
    for (const lot of lootResults) {
      if (lot.winnerId && lot.winnerId === seat.allyId) { gold -= lot.price; won.push(lot.item); }
      else gold += (lot.payouts && lot.payouts[seat.allyId]) || 0;
    }
    rows.push({
      user_id: seat.uid,
      // NOT "sale" — that kind renders as an auction-house sale ("−15% AH cut") and assumes a
      // positive net. A GDKP settlement can be negative for the winner, who bought the lot.
      kind: "gdkp",
      payload: {
        gold,
        items: won,
        subject: `${content.name} clear`,
        from: "Group Finder",
        note: won.length ? `Won ${won.length} lot(s) · GDKP settled` : (lootResults.length ? "GDKP share" : undefined),
      },
    });
  }
  return rows;
}

export async function grantRewards(content, humanSeats, enc, lootResults = []) {
  const client = sb(); if (!client) return;
  const rows = buildRewardRows(content, humanSeats, enc, lootResults);
  // Say something when a cleared run pays nobody. This returned silently before, so the first
  // live GDKP auctioned a lot, hammered it, and mailed nothing at all — with no trace anywhere.
  // A seat without a uid is a client that joined without publishing one; it cannot be mailed.
  if (!rows.length) {
    const seats = (humanSeats || []).length;
    if (seats) console.warn(`[rewards] ${content.id}: ${seats} human seat(s) but NO mail rows — ` +
      `uid missing on ${(humanSeats || []).filter((s) => !s.uid).length}. Nobody was paid.`);
    return;
  }
  const { error } = await client.from("mail").insert(rows);
  if (error) throw new Error(error.message);
  console.log(`[rewards] ${content.id}: mailed ${rows.length} player(s)` +
    (lootResults.length ? `, ${lootResults.length} lot(s) settled` : ""));
}

export function rewardGold(content, enc) {
  if (!enc.cleared) return 0;
  // Scales with the content rather than the old flat 500/300, which paid a six-player raid less
  // than the tutorial boss. Level stands in for difficulty; raids and hard modes pay more for
  // the longer, riskier run.
  const lvl = content.level || 60;
  const raid = (content.kind || "").includes("raid");
  const hard = (content.kind || "").startsWith("hard");
  return Math.round(120 * (1 + lvl / 30) * (raid ? 1.8 : 1) * (hard ? 1.5 : 1));
}

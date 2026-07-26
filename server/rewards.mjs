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

// content: the encounter def, humanSeats: [{ uid, name }], enc: final authoritative state.
export async function grantRewards(content, humanSeats, enc) {
  const client = sb(); if (!client) return;
  const gold = rewardGold(content, enc);
  const rows = humanSeats.filter((s) => s.uid).map((s) => ({
    user_id: s.uid,
    kind: "sale", // mail kind that carries gold; the client's mail claim applies it to the blob
    payload: { gold, subject: `${content.name} clear`, from: "Group Finder" },
  }));
  if (!rows.length) return;
  const { error } = await client.from("mail").insert(rows);
  if (error) throw new Error(error.message);
  // TODO(stage-4): roll item drops via the core's loot tables and attach { item } payloads;
  // for GDKP content, run the bid in-room and mail the winner + distribute the pot.
}

function rewardGold(content, enc) {
  // placeholder scaled reward; replace with the content's real reward table.
  const base = content.boss === "ashen" ? 500 : 300;
  return Math.round(base * (enc.cleared ? 1 : 0));
}

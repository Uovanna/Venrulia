-- GDKP settlement mail.
--
-- Group loot is now auctioned by the game server, which settles each run by mailing every player
-- their net: the clear payment, plus their share of each lot they did not win, minus the hammer
-- price of any lot they did. That net is NEGATIVE for a winner who bought an expensive item, and
-- it is not an auction-house sale, so it cannot reuse the 'sale' kind — that renders as
-- "sold for Xg −15% AH cut" and assumes a positive amount.
--
-- Without this the insert in server/rewards.mjs fails the CHECK constraint and the whole party
-- is silently paid nothing for a cleared run.
alter table mail drop constraint if exists mail_kind_check;
alter table mail add constraint mail_kind_check
  check (kind in ('sale', 'purchase', 'expired', 'gdkp'));

-- payload for 'gdkp': { gold, items: [item…], subject, from, note }
--   gold  signed net for this player (may be negative — the winner paid for the lot)
--   items the lots this player won, already in the client's item shape

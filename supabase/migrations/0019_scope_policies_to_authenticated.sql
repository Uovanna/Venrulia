-- Say what these policies mean: they are for signed-in players.
--
-- The advisor raised 16 "Anonymous Access Policies". None of them was an exposure. Every one is
-- declared `to public` — which includes the `anon` role — but gated on auth.uid(), and auth.uid()
-- is NULL for an anonymous caller, so `auth.uid() = user_id` is null and the row never matches.
-- Checked on the live project: every INSERT and UPDATE policy carries
-- `with_check (auth.uid() = user_id)`, so nothing could be written either.
--
-- So this is not a fix, it is a statement of intent. Declaring them `to authenticated` makes the
-- policy say what it has always meant, and stops the advisor reporting a risk that is not there —
-- which matters, because a warning list nobody trusts is a warning list nobody reads.
--
-- WHAT IS DELIBERATELY LEFT PUBLIC, and why:
--   ah_config, ah_mat_value, rarity_value_mult  reference tables the pricing UI reads
--   ah_listing (ah_browse), item_read_listed    the marketplace is meant to be browsable
--   messages                                    global chat
--   pvp_snapshot (pvp_read)                     the arena ladder
-- Those are public by design. Narrowing them would break browsing for a signed-out client, and
-- none of them exposes anything a player owns.

-- ---- a player's own records ------------------------------------------------------------------
drop policy if exists daily_claim_read on daily_claim;
create policy daily_claim_read on daily_claim for select to authenticated using (auth.uid() = user_id);

drop policy if exists item_read on item;
create policy item_read on item for select to authenticated using (auth.uid() = owner_id);

drop policy if exists ledger_read on ledger;
create policy ledger_read on ledger for select to authenticated using (auth.uid() = user_id);

drop policy if exists mail_read on mail;
create policy mail_read on mail for select to authenticated using (user_id = auth.uid());

drop policy if exists material_read on material;
create policy material_read on material for select to authenticated using (auth.uid() = user_id);

drop policy if exists wallet_read on wallet;
create policy wallet_read on wallet for select to authenticated using (auth.uid() = user_id);

-- ---- saves --------------------------------------------------------------------------------------
drop policy if exists "own save select" on saves;
create policy "own save select" on saves for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own save insert" on saves;
create policy "own save insert" on saves for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own save update" on saves;
create policy "own save update" on saves for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- arena snapshots ------------------------------------------------------------------------------
drop policy if exists pvp_insert on pvp_snapshot;
create policy pvp_insert on pvp_snapshot for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists pvp_update on pvp_snapshot;
create policy pvp_update on pvp_snapshot for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

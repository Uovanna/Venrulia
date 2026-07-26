-- 0008 fix: gear listings were invisible because escrowed items (owner_id=null) failed
-- the owner-only item RLS, so the ah_listing→item embed returned null and the client
-- dropped those rows. Allow reading any item referenced by an ACTIVE listing.
create policy item_read_listed on item for select
  using (exists (select 1 from ah_listing l where l.item_id = item.id and l.status = 'active'));

-- Cancel/expire of a gear listing deletes the escrowed item row while ah_listing.item_id still
-- references it → FK violation (default RESTRICT). Make it ON DELETE SET NULL.
alter table ah_listing drop constraint ah_listing_item_id_fkey;
alter table ah_listing
  add constraint ah_listing_item_id_fkey
  foreign key (item_id) references item(id) on delete set null;

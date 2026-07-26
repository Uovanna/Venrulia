-- Show the seller's true character name on listings (was a random name derived from id).
alter table ah_listing add column if not exists seller_name text;
-- ah_list_gear / ah_list_stack recreated with a p_seller_name param that stores seller_name.
-- (Full bodies applied live via MCP; phantom listings leave seller_name null → client shows a flavor name.)

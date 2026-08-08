-- ============================================================================
-- Fix: shop settings have never been saving
--
-- What is wrong
-- -------------
-- `pos_shop_settings` has row level security ENABLED but no policy attached.
-- With RLS on and no permissive policy, PostgreSQL denies everything to the
-- anon role, so from the app:
--
--   * every write fails with 42501 "new row violates row-level security policy"
--   * every read comes back as an empty set — not an error, just zero rows
--
-- The setup SQL shown in edospoa-pos.html does include
--   create policy "shop_settings" on pos_shop_settings for all using (true) ...
-- but it was never applied to this database — presumably the SQL was run from
-- an earlier version of that block, before the settings policy was added to it.
-- Every other table (clients, invoices, payments, expenses, pos_staff) has its
-- policy and writes fine; this is the only one missing.
--
-- Why nobody noticed
-- ------------------
-- supabase-js does not throw on a PostgREST error, it returns { error }.
-- persistShopSettings() ignored that return value, so the failing upsert looked
-- identical to a successful one and the app quietly kept the settings in
-- localStorage instead. Shop settings have therefore only ever existed in the
-- browser that entered them: clear the site data or open the POS on another
-- device and the business name, logo, M-Pesa till and bank details are gone.
--
-- Note this also means the table may already contain rows that RLS is hiding —
-- a SELECT returning nothing does not prove it is empty. Run the verification
-- at the bottom AFTER applying the policy to see what is actually in there.
--
-- Safe to re-run.
-- ============================================================================

alter table pos_shop_settings enable row level security;

drop policy if exists "shop_settings" on pos_shop_settings;
drop policy if exists "allow all" on pos_shop_settings;

-- Matches the permissive policy every other table in this project uses. It is
-- not per-shop isolation — the app passes shop_id on every query and the anon
-- key can still reach any row. Tightening that is the same wider RLS job noted
-- in section 7 of clients_tenant_customer_split.sql, and should be done for all
-- of these tables together rather than for this one alone.
create policy "shop_settings" on pos_shop_settings
  for all using (true) with check (true);

-- The table is keyed by shop and upserted on every save; index the timestamp
-- only if you start querying by it. shop_id is already the primary key.

-- ---------------------------------------------------------------------------
-- Verification — run after the policy is in place
-- ---------------------------------------------------------------------------
-- select shop_id, settings->>'bizName' as biz_name, updated_at
-- from pos_shop_settings order by updated_at desc;
--
-- Shops that have logged in but still have no row are running on browser
-- localStorage only. loadShopSettings() in edospoa-pos.html now promotes those
-- to this table automatically the next time each shop signs in from the browser
-- holding them — that part cannot be done in SQL, because the data lives in
-- localStorage on a client machine and not in this database.

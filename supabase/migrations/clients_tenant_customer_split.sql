-- ============================================================================
-- Separate platform tenants from tenants' own customers in `clients`
--
-- Background
-- ----------
-- The `clients` table holds two different kinds of row:
--
--   * a platform TENANT (a shop account) — created by edospoa-admin.html's
--     addClient(), id looks like 'client-<epoch-ms>', shop_id IS NULL
--   * a tenant's own CUSTOMER — created by edospoa-pos.html's dbInsertClient(),
--     id is a 6-char code from uid(), shop_id = the owning tenant's id
--
-- Nothing enforced that split, and two problems followed:
--
--   1. edospoa-admin.html selected every row with no filter. PostgREST caps a
--      response at 1000 rows, so once one shop's customer list grew past that
--      (2200+ rows here) real tenants fell off the end of the result and became
--      invisible in the Clients table and unfindable by search.
--   2. A tenant row had picked up shop_id = its own id, so it appeared inside
--      that shop's own customer list in the POS. Deleting it from there ran
--      `delete from clients where id = ? and shop_id = ?`, which matched — and
--      erased the whole tenant account.
--
-- Both apps have been fixed (paginated tenant-only load in the admin; the POS
-- now refuses to write or delete its own account row through the customer
-- screens). This migration repairs the data and blocks case 2 at the database.
-- Everything here is idempotent and safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Repair: a tenant row must not be scoped to itself as a customer
-- ---------------------------------------------------------------------------
update clients set shop_id = null where shop_id = id;

-- ---------------------------------------------------------------------------
-- 2. Repair: is_platform_account is a tenant-only concept. Customer rows that
--    got swept up by the admin's bulk "Mark selected as Platform" action while
--    they were still showing in the Clients table are cleared here.
-- ---------------------------------------------------------------------------
update clients set is_platform_account = false
where shop_id is not null and is_platform_account is true;

-- ---------------------------------------------------------------------------
-- 3. Guard: make the self-referencing state impossible from now on
-- ---------------------------------------------------------------------------
alter table clients drop constraint if exists clients_shop_id_not_self;
alter table clients add constraint clients_shop_id_not_self
  check (shop_id is distinct from id);

-- ---------------------------------------------------------------------------
-- 4. Index the column both apps filter on
-- ---------------------------------------------------------------------------
create index if not exists idx_clients_shop_id on clients(shop_id);

-- ---------------------------------------------------------------------------
-- 5. Orphaned shops whose tenant row was deleted by the bug above.
--
--    These shop ids still had staff, subscriptions and invoices but no row in
--    `clients`, so nobody could log into them (the POS resolves an account by
--    clients.id at login).
--
--    EDOS Centre has been restored — name and email supplied by the operator.
--    Its 15 subscriptions, 29 invoices (MMP-### / EC-QT-###), 8 customers and
--    owner staff record "Walter Imamai" were never lost and are reachable again.
-- ---------------------------------------------------------------------------
insert into clients (id, name, email, phone, event, status, created_at, is_platform_account, billing_enabled, notes)
values ('client-1778762083419', 'EDOS Centre', 'info@edoscentre.co.ke', '', 'standard', 'active',
        '2026-05-10T07:14:43.419Z', false, false,
        'Account row restored 2026-08-08 after being deleted via the POS customer list; staff, invoices and subscriptions were never lost.')
on conflict (id) do nothing;

--    STILL ORPHANED: client-1778743707934 — staff wmejasan, wimamai, adhiambo
--    and 11 module subscriptions, but no invoices and no customers, so it looks
--    like an abandoned first attempt. Left alone deliberately: give it a real
--    name and email and uncomment to bring it back, or delete its leftover rows
--    to close it out for good.
--
-- insert into clients (id, name, email, phone, event, status, created_at, is_platform_account)
-- values ('client-1778743707934', 'CHANGE ME', 'CHANGE ME', '', 'standard', 'active', '2026-05-10T00:00:00Z', false)
-- on conflict (id) do nothing;
--
-- -- or, to close it permanently:
-- delete from client_subscriptions where client_id = 'client-1778743707934';
-- delete from pos_staff           where client_id = 'client-1778743707934';

-- ---------------------------------------------------------------------------
-- 6. Platform account
--
--    The client flagged is_platform_account is EdosPoa's own shop — it is not
--    a paying tenant, it is the business that issues the tenants' subscription
--    invoices, and it is the only account whose owner/admin staff can open the
--    platform admin. Exactly one row should carry the flag.
-- ---------------------------------------------------------------------------
update clients set is_platform_account = true where id = 'client-1778762083419'; -- EDOS Centre

-- ---------------------------------------------------------------------------
-- 7. NOT DONE HERE — row level security
--
--    Every policy on these tables is still `using (true)`, and the anon key is
--    embedded in edospoa-pos.html / edospoa-admin.html. Anyone with that key
--    can read and write every tenant's data directly, whatever the login
--    screens do, and pos_staff.password_hash holds plaintext passwords.
--
--    The admin sign-in gate added alongside this migration stops casual access
--    and nothing more. Closing it properly means, at minimum:
--
--      * hashing pos_staff passwords instead of storing them as typed
--      * per-shop RLS on clients / invoices / payments / expenses so a session
--        can only reach rows matching its own shop_id
--      * restricting clients rows with shop_id IS NULL (the tenant accounts)
--        and pos_modules / client_subscriptions to a service role
--
--    That is a larger change than this migration and is deliberately left for
--    a dedicated pass rather than being half-done here.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 8. Verification
-- ---------------------------------------------------------------------------
-- select count(*) filter (where shop_id is null)     as tenants,
--        count(*) filter (where shop_id is not null) as customers
-- from clients;
--
-- -- shops with staff but no account row (should return zero rows):
-- select distinct s.client_id
-- from pos_staff s left join clients c on c.id = s.client_id
-- where c.id is null;

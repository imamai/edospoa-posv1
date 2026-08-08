-- ============================================================================
-- EdosPoa M-Pesa Tenant Billing — migration
-- Run this once in the Supabase SQL editor for the project edospoa-admin.html
-- and edospoa-pos.html connect to (project ref cnlyuwslpcgosgwdmzav).
--
-- Everything here is additive (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS),
-- safe to re-run, and does not touch or rename any existing column/table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend clients (tenants) with billing state
-- ---------------------------------------------------------------------------
alter table clients add column if not exists paid_until timestamptz;
alter table clients add column if not exists last_payment_at timestamptz;
alter table clients add column if not exists auto_suspended boolean default false;
alter table clients add column if not exists suspended_reason text;
alter table clients add column if not exists reminder_stage text default 'none'; -- none | upcoming | overdue | suspended
alter table clients add column if not exists billing_enabled boolean default false;

-- billing_enabled defaults to false for every row, including all EXISTING
-- tenants — this migration deliberately does NOT set paid_until or touch
-- status for anyone. Nothing in the daily reminder/suspension check runs
-- against a tenant until an admin explicitly flips "Enable M-Pesa Billing"
-- on for them (from the new Billing modal in edospoa-admin.html), which is
-- the moment their first 30-day cycle actually starts. Existing tenants are
-- completely unaffected by this migration on their own.

-- ---------------------------------------------------------------------------
-- 2. Payment ledger — every M-Pesa STK push attempt + manual/offline payments
-- ---------------------------------------------------------------------------
create table if not exists mpesa_payments (
  id uuid primary key default gen_random_uuid(),
  client_id text references clients(id) on delete cascade,
  amount numeric not null,
  phone text,
  method text default 'mpesa',              -- mpesa | manual
  checkout_request_id text,
  merchant_request_id text,
  mpesa_receipt text,
  status text default 'pending',            -- pending | completed | failed | cancelled
  period_amount numeric,                    -- tenant's computed 30-day due amount at time of payment
  months_covered numeric,                   -- amount / period_amount, rounded — overpayment detection
  result_desc text,
  recorded_by text,                         -- staff username, for manual/offline entries
  created_at timestamptz default now(),
  completed_at timestamptz
);

alter table mpesa_payments enable row level security;

drop policy if exists "allow all" on mpesa_payments;
create policy "allow all" on mpesa_payments for all using (true) with check (true);

create index if not exists idx_mpesa_payments_client on mpesa_payments(client_id);
create index if not exists idx_mpesa_payments_checkout on mpesa_payments(checkout_request_id);
create index if not exists idx_mpesa_payments_status on mpesa_payments(status);

-- ---------------------------------------------------------------------------
-- 3. Daily scheduled check (reminders + auto-suspend)
--    Requires pg_cron and pg_net extensions (Supabase: Database > Extensions).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace the placeholders below with your actual project ref and a
-- Supabase service_role key (Project Settings > API) before running this
-- block. Keep the service_role key out of any client-facing code — it only
-- belongs here, inside your own database.
select cron.unschedule('daily-billing-check')
where exists (select 1 from cron.job where jobname = 'daily-billing-check');

select cron.schedule(
  'daily-billing-check',
  '0 6 * * *', -- 06:00 UTC daily
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/billing-daily-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <service-role-key>',
      'Content-Type', 'application/json'
    )
  );
  $$
);

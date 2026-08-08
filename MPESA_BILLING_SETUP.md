# M-Pesa Tenant Billing — Setup Guide

Turns on M-Pesa subscription billing for EdosPoa tenants: 30-day billing cycles,
email reminders, automatic suspension on non-payment, automatic resumption on
payment, and multi-month overpayment detection.

**Existing tenants are not affected by installing this.** Every tenant has a new
`billing_enabled` flag that defaults to `false`. Nothing in this system — no
reminder, no suspension — ever runs against a tenant until an admin explicitly
clicks **Enable Billing** for them from the new Billing modal in
`edospoa-admin.html` (Clients → 💳 Billing). That's the moment their first
30-day cycle starts.

## Pricing

A tenant is billed on their **plan**, held in `clients.event`:

| Plan     | Per 30 days |
| -------- | ----------- |
| Basic    | KES 1,000   |
| Standard | KES 1,500   |
| Premium  | KES 2,500   |
| Trial    | KES 0       |

Module assignments decide what a tenant may *use*; the plan decides what they
are *charged*. The two are deliberately independent, so the module fees in the
Module Manager are catalogue pricing and never sum into anyone's bill.

The table lives in three places that must stay in step — `PLAN_PRICES` in
`edospoa-admin.html`, `PLAN_PRICES` in `edospoa-pos.html`, and `PLAN_PRICES` in
`supabase/functions/_shared/billing.ts` (which feeds both the STK push amount
and the nightly reminder/suspension check). Change a price in all three.

A tenant's plan is editable from the Billing modal, right under the amount due.
Changing it applies to the next renewal; payments already recorded keep the
`period_amount` they were taken at.

## Subscription invoices

A tenant's subscription invoice is a **real invoice of your own shop account**,
not a separate kind of document. The client row flagged `is_platform_account`
(currently **EDOS Centre**) is the issuer: invoices land in the same `invoices`
table under its `shop_id`, take the next number in its sequence (`EC-327`…),
carry its logo, KRA PIN and VAT settings, and appear in its Invoices list in the
POS like anything else it issues. Each tenant is added to that shop's client
list the first time they are invoiced.

An invoice is raised **once per tenant per billing period**. The idempotency key
is the tenant id plus the period end stamped into the invoice, so the nightly
job and the manual button can both run without ever producing a duplicate.

Two things can raise one:

- **Automatically** — `billing-daily-check` raises it when it sends the renewal
  or suspension reminder, and the email then quotes that invoice number and its
  line items.
- **On demand** — the Billing modal in the admin shows whether the current
  period has been invoiced, with a **🧾 Generate Invoice** button if not.

VAT is set to zero on generated invoices, because the issuing shop's VAT rate
lives in its own browser settings where the server cannot read it. Edit the
invoice in the POS if a subscription should carry VAT.

The logic exists twice and the two copies must stay in step:
`supabase/functions/_shared/platformInvoice.ts` (server, used by the nightly
job) and `generateTenantInvoice()` in `edospoa-admin.html` (browser, used by the
button).

## Admin access

`edospoa-admin.html` is behind a sign-in gate. Credentials are the **owner or
admin `pos_staff` accounts of the platform account** — today that is
`walter.imamai` under EDOS Centre. Staff of any other shop are refused.

You do not normally open that file directly. Log into the POS as EDOS Centre and
use **Platform Admin** in the sidebar: the page is embedded there and the POS
hands over its already-authenticated session, so there is one login, not two.
The nav item only exists for the platform account, so no tenant ever sees it.

> **This gate is a UI lock, not a security boundary.** The anon key ships inside
> these HTML files and RLS on `clients`, `pos_staff`, `invoices` and
> `client_subscriptions` is still `using (true)`, so anyone holding that key can
> read and write the same rows directly — including the plaintext passwords in
> `pos_staff.password_hash`. Making access real means writing proper RLS policies
> and hashing those passwords. Until then the gate only stops casual access.

## 1. Run the database migrations

Open the Supabase SQL editor for the project `edospoa-admin.html` /
`edospoa-pos.html` connect to (`cnlyuwslpcgosgwdmzav`), paste in and run, in order:

```
supabase/migrations/mpesa_billing.sql
supabase/migrations/tenant_identification.sql
supabase/migrations/clients_tenant_customer_split.sql
```

Both are additive/idempotent (`IF NOT EXISTS` everywhere) — safe to re-run.

`tenant_identification.sql` adds an `is_platform_account` flag to `clients`
and marks the seeded "Mejason Media Production" row with it, so the Clients
list, tenant counts, MRR, and "Collected This Month" all reflect real paying
tenants only — with a "Hide platform account" checkbox on the Clients table
(checked by default) and a 🏪 Tenant / 🏠 Platform badge on every row so
it's clear which is which even when unchecked.

It creates `mpesa_payments` (the payment ledger) and adds `paid_until`,
`last_payment_at`, `auto_suspended`, `suspended_reason`, `reminder_stage`,
`billing_enabled` to `clients`. It also tries to enable the `pg_cron` and
`pg_net` extensions — if that fails, enable them first from **Database →
Extensions** in the Supabase dashboard, then re-run just that part of the script.

The last block schedules the daily check but has two placeholders you must
fill in before running it (or re-run just that block after step 3):

```sql
url := 'https://<project-ref>.functions.supabase.co/billing-daily-check',
headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>', ...)
```

Replace `<project-ref>` with `cnlyuwslpcgosgwdmzav` and `<service-role-key>`
with the **service_role** key from Project Settings → API. This key only ever
lives inside your own database — never put it in `edospoa-admin.html`,
`edospoa-pos.html`, or any other client-facing file.

## 2. Get Daraja sandbox credentials

1. Sign up / log in at https://developer.safaricom.co.ke and create an app to
   get your own sandbox **Consumer Key** and **Consumer Secret**.
2. For a first test you can use Safaricom's published sandbox constants
   instead of setting up your own paybill:
   - Shortcode: `174379`
   - Passkey: `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`
   - Test phone number: `254708374149`

## 3. Deploy the Supabase Edge Functions

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase login
supabase functions deploy mpesa-stk-initiate --project-ref cnlyuwslpcgosgwdmzav --no-verify-jwt
supabase functions deploy mpesa-stk-callback --project-ref cnlyuwslpcgosgwdmzav --no-verify-jwt
supabase functions deploy billing-daily-check --project-ref cnlyuwslpcgosgwdmzav --no-verify-jwt
```

`--no-verify-jwt` is required: `mpesa-stk-initiate` is called from the POS
frontend with only the anon key, `mpesa-stk-callback` is called by Safaricom
(no Supabase auth at all), and `billing-daily-check` is called by pg_cron.

Set the secrets these functions read (`SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected automatically — don't set those):

```bash
supabase secrets set --project-ref cnlyuwslpcgosgwdmzav \
  MPESA_ENV=sandbox \
  MPESA_SHORTCODE=174379 \
  MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919 \
  MPESA_CONSUMER_KEY=<your consumer key> \
  MPESA_CONSUMER_SECRET=<your consumer secret> \
  MPESA_CALLBACK_URL=https://cnlyuwslpcgosgwdmzav.functions.supabase.co/mpesa-stk-callback \
  NETLIFY_SITE_URL=https://<your-netlify-site>.netlify.app
```

`NETLIFY_SITE_URL` is where `billing-daily-check` posts reminder emails — it
must point at whichever Netlify site has `netlify/functions/send-billing-reminder.js`
deployed (same site as the existing `send-invoice-email.js`).

## 4. Confirm Netlify email env vars

`netlify/functions/send-billing-reminder.js` reuses the same `EMAIL_USER` /
`EMAIL_PASS` Gmail credentials as the existing invoice-email function.
`netlify.toml` has placeholders for these — set the real values in the
Netlify dashboard (Site settings → Environment variables) if not already done.

## 5. Finish the pg_cron schedule

Re-run the last block of `mpesa_billing.sql` (the `cron.schedule(...)` call)
now that the edge function URL and service_role key are real. It runs daily
at 06:00 UTC and checks only tenants with `billing_enabled = true`.

## 6. Turn billing on for a tenant

In `edospoa-admin.html` → Clients → find the tenant → **💳 Billing** →
**Enable Billing**. This sets `paid_until = now() + 30 days` and starts
reminders/auto-suspend for that tenant only. Everyone else stays untouched.

## 7. Test end-to-end

1. Enable billing for a test tenant (step 6).
2. Log into `edospoa-pos.html` as that tenant's staff user → open the M-Pesa
   pay flow (or, to test the *suspended* path, backdate `paid_until` for that
   client to yesterday in Supabase and manually set `status='suspended',
   auto_suspended=true` — you should see the "Account Suspended" overlay with
   a working Pay button).
3. Enter `254708374149` and pay — Daraja sandbox auto-completes it, the
   `mpesa-stk-callback` function fires, `mpesa_payments` goes
   `pending → completed`, and `clients.paid_until` extends. The overlay
   should detect this within ~3 seconds and reload / prompt sign-in.
4. Try paying 2-3x the shown amount in one go and confirm `months_covered`
   in the payment history (admin Billing modal) reflects it, and
   `paid_until` extends by that many 30-day periods, not just one.
5. Invoke `billing-daily-check`'s URL directly (e.g. with `curl -X POST`) to
   trigger reminder/suspension logic without waiting for the cron schedule.

## Going to production

Swap `MPESA_ENV=sandbox` → `MPESA_ENV=production`, and `MPESA_SHORTCODE` /
`MPESA_PASSKEY` / `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` for your real
Daraja production app's values (from the Safaricom developer portal, after
your app has been approved for production/go-live). No code changes needed.

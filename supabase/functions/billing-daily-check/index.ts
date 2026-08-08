// Invoked once daily by pg_cron (see supabase/migrations/mpesa_billing.sql).
// Walks every tenant with a paid_until date and:
//   - sends an "upcoming renewal" email when within 3 days of expiry
//   - auto-suspends + sends a "suspended" email once paid_until has passed
// Reminder emails are sent via the existing Netlify + Gmail pipeline
// (netlify/functions/send-billing-reminder.js) so SMTP config lives in one place.

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { computePeriodAmount } from '../_shared/billing.ts';
import { generateTenantInvoice } from '../_shared/platformInvoice.ts';

const NETLIFY_SITE_URL = Deno.env.get('NETLIFY_SITE_URL') || '';
const REMINDER_WINDOW_DAYS = 3;

// Raise the tenant's subscription invoice under the platform's own shop
// account, so the reminder can quote a real invoice number the tenant will
// also see on the printed document. Idempotent per tenant per period, so the
// invoice is only ever created once no matter how often this runs.
// Never allowed to block the reminder: a tenant who is overdue still needs to
// hear about it even if invoicing is misconfigured.
async function invoiceFor(client: any, paidUntil: string) {
  try {
    const { invoice } = await generateTenantInvoice(client, paidUntil);
    return invoice;
  } catch (err) {
    console.error(`Could not raise a platform invoice for ${client.id}`, err);
    return null;
  }
}

async function sendReminder(
  kind: 'upcoming' | 'suspended',
  client: any,
  paidUntil: string,
  amountDue: number,
  invoice: any,
) {
  if (!NETLIFY_SITE_URL || !client.email) return;
  try {
    await fetch(`${NETLIFY_SITE_URL}/.netlify/functions/send-billing-reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: client.email,
        clientName: client.name,
        kind,
        paidUntil,
        amountDue,
        invoiceNumber: invoice?.id || null,
        invoiceItems: invoice?.items || null,
        invoiceIssuer: invoice ? await issuerName() : null,
      }),
    });
  } catch (err) {
    console.error(`Failed to send ${kind} reminder to ${client.email}`, err);
  }
}

let _issuer: string | null = null;
async function issuerName() {
  if (_issuer !== null) return _issuer;
  const { data } = await supabaseAdmin
    .from('clients')
    .select('name')
    .is('shop_id', null)
    .eq('is_platform_account', true)
    .limit(1)
    .maybeSingle();
  _issuer = data?.name || 'EdosPoa';
  return _issuer;
}

Deno.serve(async (_req) => {
  const results = { checked: 0, remindedUpcoming: 0, suspended: 0, invoiced: 0, errors: [] as string[] };

  try {
    // Only tenants an admin has explicitly opted into M-Pesa billing are
    // ever touched here — existing tenants stay billing_enabled=false and
    // are skipped entirely, regardless of paid_until.
    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select('id, name, email, phone, event, status, paid_until, auto_suspended, reminder_stage, is_platform_account')
      .eq('billing_enabled', true)
      .is('shop_id', null)
      .not('is_platform_account', 'is', true)
      .not('paid_until', 'is', null);
    if (error) throw error;

    const now = new Date();

    for (const client of clients || []) {
      results.checked++;
      try {
        const paidUntil = new Date(client.paid_until);
        const daysUntil = (paidUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);

        if (daysUntil <= 0) {
          if (client.status !== 'suspended') {
            const amountDue = await computePeriodAmount(client.id);
            const invoice = await invoiceFor(client, client.paid_until);
            await supabaseAdmin
              .from('clients')
              .update({
                status: 'suspended',
                auto_suspended: true,
                suspended_reason: 'payment overdue',
                reminder_stage: 'suspended',
              })
              .eq('id', client.id);
            await sendReminder('suspended', client, client.paid_until, amountDue, invoice);
            if (invoice) results.invoiced++;
            results.suspended++;
          }
        } else if (daysUntil <= REMINDER_WINDOW_DAYS && client.reminder_stage !== 'upcoming') {
          const amountDue = await computePeriodAmount(client.id);
          const invoice = await invoiceFor(client, client.paid_until);
          await supabaseAdmin.from('clients').update({ reminder_stage: 'upcoming' }).eq('id', client.id);
          await sendReminder('upcoming', client, client.paid_until, amountDue, invoice);
          if (invoice) results.invoiced++;
          results.remindedUpcoming++;
        }
      } catch (perClientErr) {
        results.errors.push(`${client.id}: ${String((perClientErr as any)?.message || perClientErr)}`);
      }
    }

    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as any)?.message || err), ...results }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

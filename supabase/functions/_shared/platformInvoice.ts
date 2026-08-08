// Platform billing invoices, issued as real invoices of the platform's own
// shop account (EDOS Centre).
//
// A tenant's subscription invoice is not a separate kind of document: the
// platform account is itself an EdosPoa shop, and its tenants are its clients.
// So an invoice raised here lands in the same `invoices` table, under the
// platform account's shop_id, numbered in the same sequence and rendered with
// the same branding as every other invoice that shop issues. Open the platform
// account in the POS and it is simply there in the Invoices list.
//
// The browser mirrors this file in edospoa-admin.html (generateTenantInvoice /
// nextPlatformInvoiceNumber / platformInvoiceExists). Both write the same shape
// and use the same idempotency key, so whichever runs first wins and the other
// no-ops. Change one, change the other.

import { supabaseAdmin } from './supabaseAdmin.ts';
import { planPriceFor } from './billing.ts';

// Matches deriveInitials() in edospoa-pos.html: first letter of each word,
// alphanumeric only, uppercase, max 4. "EDOS Centre" -> "EC".
export function deriveInitials(name: string | null | undefined): string {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '').charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 4);
  return initials || 'INV';
}

// The platform's own shop account — the one flagged is_platform_account.
// Returns null when none is flagged, which is what stops invoice generation
// rather than guessing at which shop should be issuing them.
export async function getPlatformAccount() {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, name, email, phone')
    .is('shop_id', null)
    .eq('is_platform_account', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Mirrors getIdPrefix() in edospoa-pos.html: an explicit idPrefix in the shop's
// saved settings wins, otherwise derive from the shop name.
async function idPrefixFor(shopId: string, shopName: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('pos_shop_settings')
    .select('settings')
    .eq('shop_id', shopId)
    .maybeSingle();
  const explicit = String(data?.settings?.idPrefix || '').trim();
  if (explicit) return explicit.toUpperCase().slice(0, 6);
  return deriveInitials(shopName);
}

// Mirrors nextInvoiceNumber(): highest trailing number across the shop's
// non-quotation documents, +1, never reusing a deleted number. Quotations run
// on their own sequence and are excluded.
export async function nextPlatformInvoiceNumber(shopId: string, shopName: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, data')
    .eq('shop_id', shopId);
  if (error) throw error;

  let maxN = 300; // first invoice is <PREFIX>-301
  for (const row of data || []) {
    if (row?.data?.type === 'quotation') continue;
    const m = String(row.id || '').match(/-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  const prefix = await idPrefixFor(shopId, shopName);
  return `${prefix}-${String(maxN + 1).padStart(3, '0')}`;
}

// Idempotency key: one invoice per tenant per billing period. periodEnd is the
// tenant's paid_until for the cycle being billed, so a reminder that fires
// twice, or an admin pressing Generate after the nightly job already ran,
// finds the existing invoice instead of raising a duplicate.
export async function findPlatformInvoice(shopId: string, tenantId: string, periodEnd: string) {
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, data')
    .eq('shop_id', shopId)
    .eq('data->>billingTenantId', tenantId)
    .eq('data->>billingPeriodEnd', periodEnd)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// The tenant has to exist as a client of the platform shop for the invoice to
// link to a real customer record (and to show up in that shop's Clients list).
// Matched on the tenant's own id stored in referred_by, so renaming a tenant
// does not create a second customer record for them.
async function ensurePlatformClient(shopId: string, tenant: any): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('shop_id', shopId)
    .eq('referred_by', tenant.id)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  // Fall back to an email match so a customer already added by hand is reused
  // rather than duplicated — then tag it so future lookups hit the fast path.
  if (tenant.email) {
    const { data: byEmail } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('shop_id', shopId)
      .eq('email', tenant.email)
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      await supabaseAdmin.from('clients').update({ referred_by: tenant.id }).eq('id', byEmail.id);
      return byEmail.id;
    }
  }

  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  await supabaseAdmin.from('clients').insert({
    id,
    shop_id: shopId,
    name: tenant.name,
    email: tenant.email || '',
    phone: tenant.phone || '',
    event: '',
    notes: 'EdosPoa platform tenant',
    referred_by: tenant.id,
    created_at: new Date().toISOString(),
  });
  return id;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (d: Date) =>
  d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

/**
 * Raise (or return the existing) subscription invoice for one tenant's billing
 * period, as an invoice of the platform's own shop.
 *
 * Returns { invoice, created } — created:false means one already existed for
 * this tenant and period and nothing was written.
 */
export async function generateTenantInvoice(tenant: any, periodEnd: string) {
  const platform = await getPlatformAccount();
  if (!platform) throw new Error('No platform account is flagged (clients.is_platform_account)');
  if (platform.id === tenant.id) throw new Error('The platform account does not invoice itself');

  const existing = await findPlatformInvoice(platform.id, tenant.id, periodEnd);
  if (existing) return { invoice: existing.data, created: false };

  const amount = planPriceFor(tenant.event);
  if (amount <= 0) throw new Error(`Tenant ${tenant.id} is on a zero-price plan — nothing to invoice`);

  const clientId = await ensurePlatformClient(platform.id, tenant);
  const invoiceId = await nextPlatformInvoiceNumber(platform.id, platform.name);

  const issued = new Date();
  const periodEndDate = new Date(periodEnd);
  const periodStartDate = new Date(periodEndDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const planName = String(tenant.event || 'basic').replace(/^./, (c: string) => c.toUpperCase());

  // VAT is left at zero: the platform shop's VAT rate lives in its own browser
  // settings, which this job cannot read. Edit the invoice in the POS if the
  // subscription should carry VAT.
  const invoice = {
    id: invoiceId,
    type: 'invoice',
    clientId,
    clientName: tenant.name,
    clientPhone: tenant.phone || '',
    clientEmail: tenant.email || '',
    clientWhatsApp: '',
    items: [
      {
        id: `sub-${tenant.id}-${periodEndDate.getTime()}`,
        name: `EdosPoa ${planName} subscription`,
        desc: `${fmtDate(periodStartDate)} — ${fmtDate(periodEndDate)}`,
        qty: 1,
        price: amount,
        dept: null,
      },
    ],
    subtotal: amount,
    discountPct: 0,
    discountAmt: 0,
    vatRate: 0,
    vatAmt: 0,
    total: amount,
    payMethod: 'credit',
    status: 'Unpaid',
    date: fmtDate(issued),
    time: fmtTime(issued),
    eventDate: fmtDate(periodEndDate),
    cashier: 'EdosPoa Billing',
    dept: [],
    sendEmail: true,
    sendWhatsApp: false,
    // Provenance + idempotency key. billingTenantId also lets the platform
    // shop filter its own invoice list down to subscription billing.
    billingTenantId: tenant.id,
    billingPeriodStart: periodStartDate.toISOString(),
    billingPeriodEnd: periodEnd,
  };

  // Same columns dbInsertInvoice() writes from the POS — the live `invoices`
  // table is (id, shop_id, data, created_at); document type lives in data.type.
  const { error } = await supabaseAdmin.from('invoices').insert({
    id: invoiceId,
    shop_id: platform.id,
    data: invoice,
    created_at: issued.toISOString(),
  });
  if (error) throw error;

  return { invoice, created: true };
}

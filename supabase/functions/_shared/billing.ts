import { supabaseAdmin } from './supabaseAdmin.ts';

// What a tenant pays per 30-day period, keyed on clients.event (the plan).
// Module subscriptions decide what a tenant may use; the plan decides what
// they are charged. Keep in step with PLAN_PRICES in edospoa-admin.html and
// edospoa-pos.html.
export const PLAN_PRICES: Record<string, number> = {
  basic: 1000,
  standard: 1500,
  premium: 2500,
  trial: 0,
};

export function planPriceFor(plan: string | null | undefined): number {
  const p = PLAN_PRICES[String(plan ?? '').toLowerCase().trim()];
  return p === undefined ? PLAN_PRICES.basic : p;
}

// The amount due per 30-day period for a tenant — their plan price.
// Returns 0 for a tenant on trial or one that no longer exists, which is what
// stops mpesa-stk-initiate from pushing an STK for nothing to collect.
export async function computePeriodAmount(clientId: string): Promise<number> {
  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .select('event')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) return 0;
  return planPriceFor(client.event);
}

// How many 30-day periods a payment covers, and the new paid_until it
// produces. Stacks on top of remaining time when paying early/renewing
// ahead, or extends from now when the tenant was already lapsed — this is
// what makes multi-month payments (and early renewals) accumulate correctly
// instead of just resetting to +30 days.
export function applyPayment(currentPaidUntil: string | null, periodAmount: number, amountPaid: number) {
  const monthsCovered = periodAmount > 0 ? Math.max(1, Math.round(amountPaid / periodAmount)) : 1;
  const now = new Date();
  const base = currentPaidUntil && new Date(currentPaidUntil) > now ? new Date(currentPaidUntil) : now;
  const newPaidUntil = new Date(base.getTime() + monthsCovered * 30 * 24 * 60 * 60 * 1000);
  return { monthsCovered, newPaidUntil };
}

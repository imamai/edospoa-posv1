// POST { client_id, phone }
// Computes the tenant's amount due for the current 30-day period, triggers a
// Daraja STK push to their phone, and records a `pending` row in
// mpesa_payments. Returns the CheckoutRequestID for the frontend to poll.

import { stkPush } from '../_shared/mpesa.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { computePeriodAmount } from '../_shared/billing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { client_id, phone } = await req.json();
    if (!client_id || !phone) {
      return new Response(JSON.stringify({ error: 'client_id and phone are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, name, billing_enabled')
      .eq('id', client_id)
      .maybeSingle();
    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: 'Unknown client_id' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!client.billing_enabled) {
      return new Response(
        JSON.stringify({ error: 'M-Pesa billing has not been enabled for this tenant yet. Contact EdosPoa support.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const periodAmount = await computePeriodAmount(client_id);
    if (periodAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'This tenant has no billable modules assigned — nothing to charge.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stk = await stkPush({
      phone,
      amount: periodAmount,
      accountReference: client.id,
      transactionDesc: 'EdosPoa Subscription',
    });

    const { error: insertErr } = await supabaseAdmin.from('mpesa_payments').insert({
      client_id,
      amount: periodAmount,
      phone,
      method: 'mpesa',
      checkout_request_id: stk.CheckoutRequestID,
      merchant_request_id: stk.MerchantRequestID,
      status: 'pending',
      period_amount: periodAmount,
    });
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        checkout_request_id: stk.CheckoutRequestID,
        customer_message: stk.CustomerMessage,
        amount: periodAmount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

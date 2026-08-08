// Public webhook Daraja calls after the customer enters their M-Pesa PIN.
// Register this function's URL as the CallBackURL / on the Daraja app.
// Must always respond 200 with ResultCode 0 to Safaricom, even on our own
// internal errors, otherwise Daraja will keep retrying the callback.

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyPayment } from '../_shared/billing.ts';

function ack() {
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback) return ack();

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    const { data: payment } = await supabaseAdmin
      .from('mpesa_payments')
      .select('*')
      .eq('checkout_request_id', checkoutRequestId)
      .maybeSingle();

    if (!payment) return ack();

    if (resultCode !== 0) {
      await supabaseAdmin
        .from('mpesa_payments')
        .update({ status: 'failed', result_desc: resultDesc, completed_at: new Date().toISOString() })
        .eq('id', payment.id);
      return ack();
    }

    const items: Array<{ Name: string; Value?: string | number }> = stkCallback.CallbackMetadata?.Item || [];
    const get = (name: string) => items.find((i) => i.Name === name)?.Value;
    const amountPaid = Number(get('Amount')) || Number(payment.amount);
    const receipt = String(get('MpesaReceiptNumber') || '');

    await supabaseAdmin
      .from('mpesa_payments')
      .update({
        status: 'completed',
        mpesa_receipt: receipt,
        amount: amountPaid,
        result_desc: resultDesc,
        completed_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('paid_until')
      .eq('id', payment.client_id)
      .maybeSingle();

    const { monthsCovered, newPaidUntil } = applyPayment(
      client?.paid_until || null,
      payment.period_amount || amountPaid,
      amountPaid
    );

    await supabaseAdmin.from('mpesa_payments').update({ months_covered: monthsCovered }).eq('id', payment.id);

    await supabaseAdmin
      .from('clients')
      .update({
        status: 'active',
        auto_suspended: false,
        suspended_reason: null,
        reminder_stage: 'none',
        last_payment_at: new Date().toISOString(),
        paid_until: newPaidUntil.toISOString(),
      })
      .eq('id', payment.client_id);

    return ack();
  } catch (err) {
    console.error('mpesa-stk-callback error', err);
    return ack();
  }
});

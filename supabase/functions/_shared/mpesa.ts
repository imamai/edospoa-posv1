// Shared Safaricom Daraja helpers for the M-Pesa tenant-billing edge functions.
// Reads config from environment (set via `supabase secrets set`), defaulting
// to Daraja's published sandbox values so a first end-to-end test works
// before the tenant has their own Daraja app.

const ENV = Deno.env.get('MPESA_ENV') || 'sandbox';
const BASE_URL = ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

export const MPESA_SHORTCODE = Deno.env.get('MPESA_SHORTCODE') || '174379';
export const MPESA_PASSKEY = Deno.env.get('MPESA_PASSKEY') || '';
const CONSUMER_KEY = Deno.env.get('MPESA_CONSUMER_KEY') || '';
const CONSUMER_SECRET = Deno.env.get('MPESA_CONSUMER_SECRET') || '';
export const MPESA_CALLBACK_URL = Deno.env.get('MPESA_CALLBACK_URL') || '';

export function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

export function stkPassword(ts: string) {
  const raw = `${MPESA_SHORTCODE}${MPESA_PASSKEY}${ts}`;
  return btoa(raw);
}

// Daraja requires 2547XXXXXXXX / 2541XXXXXXXX format.
export function normalizeMsisdn(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return '254' + digits.slice(1);
  if (digits.startsWith('7') || digits.startsWith('1')) return '254' + digits;
  return digits;
}

export async function getAccessToken(): Promise<string> {
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error('MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET are not configured');
  }
  const creds = btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`);
  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  if (!res.ok) {
    throw new Error(`Daraja OAuth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

export async function stkPush(opts: {
  phone: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}) {
  const token = await getAccessToken();
  const ts = timestamp();
  const password = stkPassword(ts);
  const msisdn = normalizeMsisdn(opts.phone);

  const body = {
    BusinessShortCode: MPESA_SHORTCODE,
    Password: password,
    Timestamp: ts,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(opts.amount),
    PartyA: msisdn,
    PartyB: MPESA_SHORTCODE,
    PhoneNumber: msisdn,
    CallBackURL: MPESA_CALLBACK_URL,
    AccountReference: opts.accountReference.slice(0, 12),
    TransactionDesc: opts.transactionDesc.slice(0, 13),
  };

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.errorCode) {
    throw new Error(data.errorMessage || data.error_description || `STK push failed: ${res.status}`);
  }
  return data as {
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResponseCode: string;
    ResponseDescription: string;
    CustomerMessage: string;
  };
}

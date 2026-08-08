// Netlify Function to send EdosPoa tenant billing reminder/suspension emails.
// Called by the Supabase billing-daily-check edge function and by
// mpesa-stk-callback (payment confirmation). Reuses the same Gmail
// transporter/env vars as send-invoice-email.js.

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtAmount(n) {
  return `KSh ${Number(n || 0).toLocaleString()}`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// The invoice block quotes the real invoice raised under the platform's own
// shop account, so the number in this email matches the document the tenant
// is shown in the POS and on any printed copy. Omitted entirely when no
// invoice could be raised — better a reminder with no invoice than none.
function invoiceBlock(invoiceNumber, invoiceItems, invoiceIssuer, amountDue) {
  if (!invoiceNumber) return '';
  const rows = (invoiceItems || []).map(it => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">
        ${esc(it.name)}${it.desc ? `<br/><span style="color:#777;font-size:12px">${esc(it.desc)}</span>` : ''}
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">
        ${fmtAmount(Number(it.price || 0) * Number(it.qty || 1))}
      </td>
    </tr>`).join('');

  return `
    <div style="border:1px solid #e2e2e2;border-radius:8px;padding:14px 16px;margin:16px 0;background:#fafafa">
      <div style="font-weight:700;margin-bottom:2px">Invoice ${esc(invoiceNumber)}</div>
      <div style="color:#777;font-size:12px;margin-bottom:10px">Issued by ${esc(invoiceIssuer || 'EdosPoa')}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${rows}
        <tr>
          <td style="padding:8px 10px;font-weight:700">Total</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;white-space:nowrap">${fmtAmount(amountDue)}</td>
        </tr>
      </table>
    </div>`;
}

function buildEmail(kind, clientName, paidUntil, amountDue, invoiceNumber, invoiceItems, invoiceIssuer) {
  const invoiceHtml = invoiceBlock(invoiceNumber, invoiceItems, invoiceIssuer, amountDue);
  const invoiceRef = invoiceNumber ? ` (invoice ${esc(invoiceNumber)})` : '';

  if (kind === 'upcoming') {
    return {
      subject: `Your EdosPoa subscription renews soon${invoiceNumber ? ` — invoice ${invoiceNumber}` : ''}`,
      html: `
        <h2>Hi ${esc(clientName)},</h2>
        <p>Your EdosPoa subscription is due for renewal on <strong>${fmtDate(paidUntil)}</strong>.</p>
        ${invoiceHtml || `<p><strong>Amount due:</strong> ${fmtAmount(amountDue)}</p>`}
        <p>Pay via M-Pesa from the <strong>Billing</strong> page inside your EdosPoa POS account to avoid any interruption to your service.</p>
        <p>Thank you for using EdosPoa!</p>`
    };
  }
  if (kind === 'suspended') {
    return {
      subject: `Action needed: your EdosPoa account has been suspended${invoiceNumber ? ` — invoice ${invoiceNumber}` : ''}`,
      html: `
        <h2>Hi ${esc(clientName)},</h2>
        <p>Your EdosPoa subscription payment was due on <strong>${fmtDate(paidUntil)}</strong>${invoiceRef} and has not been received, so access to your account has been suspended.</p>
        ${invoiceHtml || `<p><strong>Amount due:</strong> ${fmtAmount(amountDue)}</p>`}
        <p>Pay via M-Pesa from the <strong>Billing</strong> page on your EdosPoa login screen to restore access immediately — service resumes automatically as soon as payment is confirmed.</p>
        <p>Need help? Contact EdosPoa support.</p>`
    };
  }
  // payment received confirmation
  return {
    subject: `Payment received — EdosPoa subscription active`,
    html: `
      <h2>Hi ${esc(clientName)},</h2>
      <p>We've received your payment of <strong>${fmtAmount(amountDue)}</strong>${invoiceRef}. Your EdosPoa subscription is now active until <strong>${fmtDate(paidUntil)}</strong>.</p>
      <p>Thank you!</p>`
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { email, clientName, kind, paidUntil, amountDue,
            invoiceNumber, invoiceItems, invoiceIssuer } = JSON.parse(event.body);
    if (!email || !kind) {
      return { statusCode: 400, body: JSON.stringify({ error: 'email and kind are required' }) };
    }

    const { subject, html } = buildEmail(
      kind, clientName || 'there', paidUntil, amountDue,
      invoiceNumber, invoiceItems, invoiceIssuer,
    );

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, message: `Reminder sent to ${email}` }) };
  } catch (error) {
    console.error('Billing reminder email error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

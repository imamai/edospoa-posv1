// Netlify Function to send invoice emails with PDF attachment
// Deploy this with your Netlify site

const nodemailer = require('nodemailer');

// Sender identity — see the note in send-billing-reminder.js. EMAIL_FROM is the
// visible sender; EMAIL_USER is the account that authenticates to the mail
// server, and the two differ unless the SMTP account is the address itself.
const EMAIL_FROM = process.env.EMAIL_FROM || 'EDOS Centre <billing@edoscentre.co.ke>';

const transporter = nodemailer.createTransport(
  process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      }
    : {
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      }
);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { email, clientName, invoice, documents, pdfBase64, fileName,
            totalPaid, balance, statusLabel, shop } = JSON.parse(event.body);

    // Every detail below belongs to the shop that raised the document and is
    // sent through in the request from its own Settings. Nothing here falls
    // back to another business: an invoice that quotes the wrong M-Pesa till
    // sends a customer's money to the wrong company, so a missing value is
    // omitted from the email rather than substituted.
    const s = shop || {};
    const bizName = s.name || 'your supplier';
    const phones = (Array.isArray(s.phones) ? s.phones : []).filter(Boolean);

    const payLines = [
      s.mpesaTill    ? `📱 <strong>M-Pesa Till Number:</strong> ${esc(s.mpesaTill)}` : '',
      s.mpesaPaybill ? `📱 <strong>M-Pesa Paybill:</strong> ${esc(s.mpesaPaybill)}${s.mpesaAccount ? ` &nbsp;·&nbsp; Account: ${esc(s.mpesaAccount)}` : ''}` : '',
      s.bankName     ? `🏦 <strong>Bank Transfer — ${esc(s.bankName)}</strong>${s.bankBranch ? `, ${esc(s.bankBranch)}` : ''}` : '',
      s.bankAccount  ? `Account: ${esc(s.bankAccount)}` : '',
      s.bankHolder   ? `Account Name: ${esc(s.bankHolder)}` : '',
    ].filter(Boolean);

    const contactLines = [
      phones.length ? `📞 Phone: ${phones.map(esc).join(' / ')}` : '',
      s.email       ? `📧 Email: ${esc(s.email)}` : '',
      s.website     ? `🌐 ${esc(s.website)}` : '',
      s.kraPin      ? `Tax ID: ${esc(s.kraPin)}` : '',
    ].filter(Boolean);

    const contactBlock = `
        ${payLines.length ? `<h3>Payment Methods</h3><p>${payLines.join('<br/>')}</p>` : ''}
        ${contactLines.length ? `<h3>Contact Information</h3><p>${contactLines.join('<br/>')}</p>` : ''}
        <p>Thank you for choosing ${esc(bizName)}!</p>
        <p>
          Best regards,<br/>
          ${esc(bizName)}${s.location ? `<br/>${esc(s.location)}` : ''}
        </p>
        ${s.footnote ? `<p style="color:#777;font-size:12px">${esc(s.footnote)}</p>` : ''}`;

    // A "documents" array means this is a combined multi-document send from
    // the Client Detail statement view — one PDF covering all of them, with
    // a summary table instead of a single invoice's line items.
    const isMulti = Array.isArray(documents) && documents.length > 0;

    const subject = isMulti
      ? `${documents.length} document(s) from ${bizName}`
      : `Invoice ${invoice.id} from ${bizName} - ${statusLabel}`;

    const html = isMulti ? `
        <h2>Dear ${esc(clientName)},</h2>
        <p>Please find your ${documents.length} document(s) attached as a single PDF:</p>

        <h3>Documents</h3>
        <table style="border-collapse:collapse;width:100%">
          <tr>
            <th style="border:1px solid #ddd;padding:8px;text-align:left">Doc #</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:left">Type</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:left">Date</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:left">Status</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right">Total</th>
          </tr>
          ${documents.map(d => `
            <tr>
              <td style="border:1px solid #ddd;padding:8px">${d.id}</td>
              <td style="border:1px solid #ddd;padding:8px">${d.type}</td>
              <td style="border:1px solid #ddd;padding:8px">${d.date}</td>
              <td style="border:1px solid #ddd;padding:8px">${d.status}</td>
              <td style="border:1px solid #ddd;padding:8px;text-align:right">KSh ${Number(d.total).toLocaleString()}</td>
            </tr>
          `).join('')}
        </table>
        <p>Full itemized detail for each document is in the attached PDF.</p>
        ${contactBlock}
      ` : `
        <h2>Dear ${esc(clientName)},</h2>
        <p>Please find your invoice details below:</p>

        <h3>Invoice Information</h3>
        <p>
          <strong>Invoice #:</strong> ${invoice.id}<br/>
          <strong>Date:</strong> ${invoice.date}<br/>
          <strong>Status:</strong> ${statusLabel}
        </p>

        <h3>Items</h3>
        <table style="border-collapse:collapse;width:100%">
          ${invoice.items.map(i => `
            <tr>
              <td style="border:1px solid #ddd;padding:8px">${i.name}</td>
              <td style="border:1px solid #ddd;padding:8px;text-align:right">×${i.qty}</td>
              <td style="border:1px solid #ddd;padding:8px;text-align:right">KSh ${(i.price * i.qty).toLocaleString()}</td>
            </tr>
          `).join('')}
        </table>

        <h3>Summary</h3>
        <p>
          <strong>Subtotal:</strong> KSh ${invoice.subtotal.toLocaleString()}<br/>
          ${invoice.discountAmt > 0 ? `<strong>Discount (${invoice.discountPct}%):</strong> -KSh ${invoice.discountAmt.toLocaleString()}<br/>` : ''}
          <strong>Total Amount:</strong> KSh ${invoice.total.toLocaleString()}<br/>
          <strong>Amount Paid:</strong> KSh ${totalPaid.toLocaleString()}<br/>
          <strong style="color:red">Balance Due:</strong> KSh ${balance.toLocaleString()}
        </p>
        ${contactBlock}
      `;

    const mailOptions = {
      from: EMAIL_FROM,
      replyTo: EMAIL_FROM,
      to: email,
      subject,
      html,
      attachments: [{
        filename: isMulti ? (fileName || 'documents.pdf') : `${invoice.id}-invoice.pdf`,
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf'
      }]
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: `Email sent to ${email}` })
    };
  } catch (error) {
    console.error('Email sending error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

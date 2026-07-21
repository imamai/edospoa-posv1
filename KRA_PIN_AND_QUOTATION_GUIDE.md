# KRA PIN & Quotation Feature Guide

## Overview
EdosPoa now includes KRA PIN support and a Quotation feature that mirrors the Invoice format. Both features help you manage tax compliance and professional client communications.

---

## 1. KRA PIN in Business Settings

### Adding Your KRA PIN
1. **In the POS**: Go to **Settings** → **Business Info** → Find "**Bank & Tax Settings**" section
2. Enter your **KRA PIN** (e.g., A123456789ABC)
3. Click **Save Settings**

### Where KRA PIN Appears
- ✅ **Invoice PDFs** - shown in footer
- ✅ **Quotation PDFs** - shown in footer
- ✅ **Receipts** - shown in receipt footer

---

## 2. Quotation Feature

### What is a Quotation?
A quotation is a formal document sent to prospective clients showing:
- Service items with quantities and pricing
- Total quoted price
- Terms & conditions (30-day validity)
- Your business information
- KRA PIN for tax compliance

### How to Generate a Quotation

#### From the POS (Mejason POS):
1. Create a new sale for a client
2. Add items to the cart
3. View the invoice (click the invoice preview)
4. In the invoice modal, click **"Quotation PDF"** button
5. A PDF will download with filename: **QT-{invoice-id}-quotation.pdf**

#### From the Invoice:
1. Go to **Invoices** section
2. Click on any invoice
3. The invoice details modal opens
4. Click **"Quotation PDF"** to download

### Quotation vs Invoice Differences

| Feature | Quotation | Invoice |
|---------|-----------|---------|
| Title | **QUOTATION** (amber) | **INVOICE** (black) |
| Number Format | QT-XXXXX | XXXXX |
| Amount Section | "Quoted Price" | "Amount Due" |
| Payment Terms | Terms & Conditions | Payment Instructions |
| Validity | 30 days | N/A (immediate) |
| Purpose | Sales proposal | Payment request |
| KRA PIN | ✅ Yes | ✅ Yes |

---

## 3. Using Quotations with Clients

### Workflow Example:
1. **Client inquires** → Create cart in POS with quoted services
2. **Send quotation** → Download & email/print quotation PDF
3. **Client accepts** → Convert to invoice once confirmed
4. **Invoice sent** → Same items, now as billable invoice
5. **Payment tracked** → Record payments against invoice

### Sharing Quotations:
- **Email**: Export PDF and attach to email
- **WhatsApp**: Share PDF link or screenshot
- **Print**: Click quotation PDF, then print
- **Download**: Keep on device for records

---

## 4. Settings to Update

Make sure your Business Settings include:
```
✓ Business Name
✓ Business Location
✓ Contact Phone(s)
✓ Email Address
✓ Website (optional)
✓ Bank Name & Account
✓ KRA PIN ← NEW
```

All these details will appear on both invoices and quotations.

---

## 5. Technical Details

### Quotation Template Structure:
- Header with company logo and branding
- Quote number and dates
- Client details ("For")
- Item table with quantities and pricing
- Subtotal, discounts, total
- Terms & conditions (30-day validity, 50% deposit required, etc.)
- Signature blocks for authorized person & client
- Footer with KRA PIN and business name

### PDF Naming Convention:
- Invoice: `{invoice-id}-invoice.pdf` (e.g., INV-001-invoice.pdf)
- Quotation: `QT-{invoice-id}-quotation.pdf` (e.g., QT-INV-001-quotation.pdf)
- Receipt: `{invoice-id}-receipt.pdf` (e.g., INV-001-receipt.pdf)

---

## 6. Common Use Cases

### Use Quotations When:
- ✅ Client requests a price estimate
- ✅ Large or complex projects need approval
- ✅ Multiple service packages being compared
- ✅ Need to secure client's formal acceptance before proceeding
- ✅ Event date is tentative

### Use Invoices When:
- ✅ Service has been rendered
- ✅ Client is ready to pay
- ✅ Amount is final and not subject to change
- ✅ Service delivery confirmed

---

## 7. Tips & Best Practices

1. **Always include KRA PIN** in your business settings for tax compliance
2. **Customize terms & conditions** if needed (edit quotation template)
3. **Keep quotations for 30 days** - set reminders for follow-up
4. **Use consistent branding** - upload your logo in settings
5. **Track quotations** - note which ones became invoices
6. **Email both quotation and invoice** when converting to ensure client has both versions

---

## 8. Support & Questions

For issues with:
- **KRA PIN display**: Check Business Settings under "Bank & Tax Settings"
- **Quotation PDF generation**: Ensure items are added to invoice before generating
- **Formatting/layout**: Quotations use same template as invoices, customize in code if needed
- **Sharing quotations**: Export as PDF and use email/WhatsApp integrations

---

**Last Updated**: May 14, 2026
**Version**: 1.0

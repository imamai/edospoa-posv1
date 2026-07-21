# Automated Invoice Sending Setup Guide

## Overview
The POS system now supports fully automated invoice sending via Email and WhatsApp with PDF attachments.

## Email Sending Setup (Gmail)

### 1. Enable Gmail App Password
1. Go to: https://myaccount.google.com/security
2. Enable 2-Factor Authentication
3. Go to App passwords and select Mail & Windows
4. Copy the 16-character password

### 2. Deploy Email Function
Set environment variables in Netlify:
```
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-16-char-app-password
```

### 3. Install Dependencies
```bash
npm install nodemailer
```

## WhatsApp Sending Setup (Twilio)

### 1. Create Twilio Account
1. Sign up at: https://www.twilio.com
2. Get your Account SID and Auth Token
3. Get a WhatsApp enabled phone number

### 2. Deploy WhatsApp Function
Set environment variables in Netlify:
```
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890  (Your Twilio number)
```

### 3. Install Dependencies
```bash
npm install twilio
```

## Alternative Services

### For Email:
- **SendGrid**: Free tier, high limits
- **Mailgun**: Developer-friendly
- **AWS SES**: Cost-effective at scale

### For WhatsApp:
- **WhatsApp Business API**: Official API
- **MessageBird**: Unified messaging
- **Vonage (Nexmo)**: Multiple channel support

## Local Testing

To test locally without backend:
1. The system will generate PDF and download it
2. Open WhatsApp Web manually (already formatted message ready)
3. Attach the downloaded PDF

## File Structure
```
netlify/
├── functions/
│   ├── send-invoice-email.js
│   └── send-whatsapp.js
└── netlify.toml (configure functions directory)
```

## Usage in System

When user clicks "Email" or "WhatsApp" button:
1. System generates invoice PDF
2. Calls backend function with PDF data
3. Backend service sends automatically
4. User sees confirmation message

No manual steps needed!

// Netlify Function to send invoice via WhatsApp with PDF attachment
// Requires Twilio credentials
// Deploy this with your Netlify site

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { phone, message, pdfBase64, fileName } = JSON.parse(event.body);

    // Format phone number to international format
    const phoneNumber = phone.startsWith('+') ? phone : '+' + phone;

    // Create a temporary URL for the PDF (if stored in cloud storage)
    // For this example, we'll send the message with the PDF base64
    // In production, upload PDF to cloud storage and send URL

    const messageResponse = await client.messages.create({
      body: message,
      from: fromPhone, // Your Twilio number
      to: phoneNumber,
      mediaUrl: undefined // Add URL if PDF is stored in cloud storage
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `WhatsApp message sent to ${phone}`,
        messageSid: messageResponse.sid
      })
    };
  } catch (error) {
    console.error('WhatsApp sending error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// /api/stkpush.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { phone, amount } = req.body;
  const shortCode = "YOUR_SHORTCODE";
  const passKey = "YOUR_PASSKEY";
  const consumerKey = "YOUR_CONSUMER_KEY";
  const consumerSecret = "YOUR_CONSUMER_SECRET";

  try {
    // Get Access Token
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenRes = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: `Basic ${auth}` },
    });
    const tokenData = await tokenRes.json();

    // STK Push Request
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0,14);
    const password = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString("base64");

    const stkRes = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortCode,
        PhoneNumber: phone,
        CallBackURL: "https://YOURDOMAIN/api/mpesa-callback",
        AccountReference: "Bohemian Integrations",
        TransactionDesc: "Order Payment",
      }),
    });

    const stkData = await stkRes.json();
    res.status(200).json(stkData);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

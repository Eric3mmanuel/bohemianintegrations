// /api/mpesaExpress.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST requests allowed" });
  }

  const { phone, amount } = req.body;

  // --- ENV VARIABLES (set these on Vercel dashboard) ---
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE; // e.g. 174379 for sandbox
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL; // must be HTTPS!

  try {
    // 1️⃣ Generate Access Token
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenRes = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: `Basic ${auth}` },
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2️⃣ Prepare STK Push Data
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

    const stkData = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone, // customer phone number, e.g. 2547XXXXXXXX
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: "Bohemian Integrations",
      TransactionDesc: "Payment for Order",
    };

    // 3️⃣ Send STK Push
    const stkRes = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stkData),
    });

    const stkResult = await stkRes.json();

    if (stkResult.ResponseCode === "0") {
      return res.status(200).json({
        success: true,
        message: "STK Push sent successfully. Check your phone to complete payment.",
        data: stkResult,
      });
    } else {
      return res.status(400).json({ success: false, error: stkResult });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

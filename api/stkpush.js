// /api/stkpush.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { phone, totalAmount } = req.body;

  if (!phone || !totalAmount) {
    return res.status(400).json({ message: "Phone number and amount are required." });
  }

  // 🔐 Your Daraja credentials from the Safaricom Developer Portal
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE; // e.g., 174379
  const passkey = process.env.MPESA_PASSKEY;

  // 🕒 Timestamp for password generation
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);

  const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

  try {
    // ✅ 1. Get access token
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error("Failed to get access token");
    }

    // ✅ 2. Send STK Push
    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: totalAmount,
          PartyA: phone.startsWith("254") ? phone : phone.replace(/^0/, "254"),
          PartyB: shortcode,
          PhoneNumber: phone.startsWith("254") ? phone : phone.replace(/^0/, "254"),
          CallBackURL: "https://bohemianintegrations.vercel.app/api/mpesaCallback"
          AccountReference: "BohemianOrder",
          TransactionDesc: "Bohemian Integrations Order Payment",
        }),
      }
    );

    const stkData = await stkResponse.json();
    return res.status(200).json(stkData);
  } catch (error) {
    console.error("STK Push Error:", error);
    return res.status(500).json({ message: "STK Push failed", error: error.message });
  }
}
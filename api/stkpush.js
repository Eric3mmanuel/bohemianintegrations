// File: /api/stkpush.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    name,
    phone,   // phone number from checkout form
    email,
    address,
    cart,
    total,
  } = req.body;

  try {
    // Step 1: get access token
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const tokenResponse = await fetch(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Step 2: Prepare STK push data
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);

    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    const stkPayload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: parseInt(total),
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: 'https://bohemianintegrations.vercel.app/api/mpesaCallback',
      AccountReference: 'Bohemian Integrations',
      TransactionDesc: `Payment by ${name}`,
    };

    // Step 3: Send STK push
    const stkResponse = await fetch(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stkPayload),
      }
    );

    const data = await stkResponse.json();
    console.log('STK Push Response:', data);

    return res.status(200).json({
      message: 'STK push initiated successfully',
      response: data,
    });
  } catch (error) {
    console.error('Error during STK push:', error);
    return res.status(500).json({ error: 'STK push failed', details: error });
  }
}
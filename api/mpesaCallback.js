// File: /api/mpesaCallback.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const callbackData = req.body; // JSON sent by Safaricom Daraja

    console.log("📩 M-PESA Callback Received:", JSON.stringify(callbackData, null, 2));

    // --- Validate Safaricom callback structure ---
    const stkCallback = callbackData?.Body?.stkCallback;
    if (!stkCallback) {
      return res.status(400).json({ error: "Invalid callback structure" });
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = stkCallback;

    // --- Handle successful payment ---
    if (ResultCode === 0) {
      const amount = CallbackMetadata?.Item?.find((i) => i.Name === "Amount")?.Value;
      const mpesaReceipt = CallbackMetadata?.Item?.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
      const phone = CallbackMetadata?.Item?.find((i) => i.Name === "PhoneNumber")?.Value;
      const transactionDate = CallbackMetadata?.Item?.find((i) => i.Name === "TransactionDate")?.Value;

      // ✅ Example: Save to your database or log file
      console.log("✅ Payment Successful:", {
        amount,
        mpesaReceipt,
        phone,
        transactionDate,
        CheckoutRequestID,
      });

      // Optionally: you can store it in a JSON file if you don’t have DB yet
      // For example (optional only for testing):
      // import fs from 'fs';
      // fs.appendFileSync('/tmp/mpesa_payments.json', JSON.stringify({amount, mpesaReceipt, phone, transactionDate}, null, 2));

      // ✅ Respond success to Safaricom (must always send this back)
      return res.status(200).json({ status: "paid", message: "Payment confirmed" });
    }

    // ❌ Handle failed or cancelled payments
    console.warn("❌ Payment Failed:", ResultDesc);
    return res.status(200).json({ status: "failed", message: ResultDesc });
  } catch (err) {
    console.error("🚨 Callback Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

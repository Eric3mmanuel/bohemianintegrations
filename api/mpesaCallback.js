// /api/mpesaCallback.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const callbackData = req.body;

  console.log("📩 M-Pesa Callback Received:");
  console.dir(callbackData, { depth: null });

  try {
    const resultCode =
      callbackData?.Body?.stkCallback?.ResultCode ?? "No ResultCode";
    const resultDesc =
      callbackData?.Body?.stkCallback?.ResultDesc ?? "No ResultDesc";
    const amount =
      callbackData?.Body?.stkCallback?.CallbackMetadata?.Item?.find(
        (i) => i.Name === "Amount"
      )?.Value ?? 0;
    const phone =
      callbackData?.Body?.stkCallback?.CallbackMetadata?.Item?.find(
        (i) => i.Name === "PhoneNumber"
      )?.Value ?? "Unknown";

    if (resultCode === 0) {
      console.log(
        `✅ Payment successful! ${phone} paid KES ${amount}. Description: ${resultDesc}`
      );

      // TODO: (Optional)
      // Save to Firestore, send email, or trigger order confirmation here
    } else {
      console.warn(`⚠️ Payment failed or cancelled: ${resultDesc}`);
    }

    res.json({ status: "Received" });
  } catch (error) {
    console.error("Callback Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

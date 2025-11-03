// /api/mpesaCallback.js

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const callbackData = req.body;

      console.log("M-Pesa STK Callback Received:", callbackData);

      // Here you can save to a database, or trigger WhatsApp/email notifications
      // For now, we'll just send a 200 OK response to M-Pesa
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
      console.error("Callback Error:", error);
      return res.status(500).json({ ResultCode: 1, ResultDesc: "Internal Error" });
    }
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}
// /api/checkPayment.js
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { checkoutRequestID } = req.query;
    if (!checkoutRequestID) return res.status(400).json({ error: "Missing checkoutRequestID" });

    const filePath = path.join(process.cwd(), "payments.json");

    if (!fs.existsSync(filePath)) {
      return res.status(200).json({ status: "pending" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const record = data[checkoutRequestID];

    if (!record) {
      return res.status(200).json({ status: "pending" });
    }

    res.status(200).json({ status: record.status });
  } catch (error) {
    console.error("Error checking payment:", error);
    res.status(500).json({ error: "Server error" });
  }
}

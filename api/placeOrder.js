// /api/createOrder.js
import sgMail from "@sendgrid/mail";
import PDFDocument from "pdfkit";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { name, email, phone, address, items, total } = req.body;

  if (!name || !email || !phone || !address || !items || !total)
    return res.status(400).json({ error: "Missing fields" });

  try {
    // Initialize SendGrid
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // --- Generate PDF Invoice ---
    const doc = new PDFDocument();
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);

      // --- Send Email with PDF Invoice ---
      const msg = {
        to: email,
        from: process.env.SENDER_EMAIL,
        subject: "Your Order Invoice – Bohemian Integrations",
        text: `Hello ${name}, thank you for your order! Find your invoice attached.`,
        attachments: [
          {
            content: pdfBuffer.toString("base64"),
            filename: "invoice.pdf",
            type: "application/pdf",
            disposition: "attachment",
          },
        ],
      };

      await sgMail.send(msg);

      // --- Send WhatsApp Notification ---
      const message = `🪶 *Bohemian Integrations* 🪶\n\nHello ${name}, thank you for your order!\n\n📦 Items: ${items
        .map((i) => `${i.name} x${i.qty}`)
        .join(", ")}\n💰 Total: ${total}\n📍 Address: ${address}\n\nWe'll process your order shortly!`;

      await fetch(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: message },
        }),
      });

      // ✅ Return success
      return res.status(200).json({ success: true });
    });

    // Build PDF
    doc.fontSize(20).text("Bohemian Integrations", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Invoice for: ${name}`);
    doc.text(`Email: ${email}`);
    doc.text(`Phone: ${phone}`);
    doc.text(`Address: ${address}`);
    doc.moveDown();
    doc.text("Items:");
    items.forEach((item) => {
      doc.text(`- ${item.name} x${item.qty}`);
    });
    doc.moveDown();
    doc.fontSize(16).text(`Total: ${total}`);
    doc.end();
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

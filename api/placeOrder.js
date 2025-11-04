import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import stream from "stream";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, email, phone, address, paymentMethod, cart } = req.body;

    // ✅ Validate fields
    if (!name || !email || !cart?.length) {
      return res.status(400).json({ error: "Missing order details" });
    }

    // ✅ Generate PDF invoice in memory
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const bufferChunks = [];
      doc.on("data", chunk => bufferChunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(bufferChunks)));
      doc.on("error", reject);

      // --- Bohemian Branding ---
      doc.image("https://bohemianintegrations.vercel.app/Bohemian_Integrations_logo.jpg", {
        fit: [80, 80],
        align: "center",
      });
      doc.fontSize(18).text("Bohemian Integrations", { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`Order Invoice\n\nCustomer: ${name}\nEmail: ${email}\nPhone: ${phone}\nPayment Method: ${paymentMethod}\n\n`);

      doc.text("Items Ordered:");
      cart.forEach((item, i) => {
        doc.text(`${i + 1}. ${item.name} - ${item.quantity} x ${item.price}`);
      });

      doc.moveDown();
      const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
      doc.text(`Total: KES ${total}`);
      doc.moveDown();
      doc.text("Thank you for choosing Bohemian Integrations 🙏\nMay abundance find you, always 💚");

      doc.end();
    });

    // ✅ Setup Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "bohemianintegrations@gmail.com", // 🔔 Change later if needed
        pass: process.env.GMAIL_APP_PASSWORD, // Use App Password
      },
    });

    // ✅ Email body (text invoice)
    const textInvoice = `
Bohemian Integrations - Order Invoice

Customer: ${name}
Email: ${email}
Phone: ${phone}
Payment Method: ${paymentMethod}
Address: ${address || "N/A"}

Items:
${cart.map(i => `- ${i.name} (${i.quantity} x ${i.price})`).join("\n")}

Total: KES ${cart.reduce((sum, i) => sum + i.price * i.quantity, 0)}

Thank you for choosing Bohemian Integrations 🙏
May abundance find you, always 💚
`;

    // ✅ Send email
    await transporter.sendMail({
      from: '"Bohemian Integrations" <bohemianintegrations@gmail.com>',
      to: email,
      bcc: "bohemianintegrations@gmail.com", // copy to you
      subject: "Your Bohemian Integrations Order Invoice",
      text: textInvoice,
      attachments: [
        {
          filename: "invoice.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    // ✅ Respond success in JSON (fixes your current error)
    return res.status(200).json({ success: true, message: "Order placed successfully" });
  } catch (err) {
    console.error("Order error:", err);
    return res.status(500).json({ error: "A server error occurred" });
  }
}
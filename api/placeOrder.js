// /api/placeOrder.js
import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { name, email, phone, address, cartItems, totalAmount } = req.body;

  if (!name || !email || !phone || !cartItems || !totalAmount) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // 🧾 Format order summary
  const orderSummary = cartItems
    .map(
      (item, i) =>
        `${i + 1}. ${item.name} x${item.quantity} — KES ${item.price * item.quantity}`
    )
    .join("\n");

  const messageText = `🌿 *Bohemian Integrations Order* 🌿
  
👤 Name: ${name}
📧 Email: ${email}
📱 Phone: ${phone}
🏡 Address: ${address}

🛒 *Items Ordered:*
${orderSummary}

💰 *Total:* KES ${totalAmount}

Thank you for shopping with us 💚
— Bohemian Integrations Team`;

  try {
    // ✅ 1. Send WhatsApp messages (to customer & you)
    const whatsappURL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

    const sendWhatsApp = async (to) => {
      await fetch(whatsappURL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: messageText },
        }),
      });
    };

    await Promise.all([
      sendWhatsApp(phone), // to customer
      sendWhatsApp(process.env.OWNER_WHATSAPP_NUMBER), // to you
    ]);

    // ✅ 2. Send email using Nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.BOHEMIAN_EMAIL,
        pass: process.env.BOHEMIAN_EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Bohemian Integrations" <${process.env.BOHEMIAN_EMAIL}>`,
      to: `${email}, ${process.env.BOHEMIAN_EMAIL}`,
      subject: "Bohemian Integrations Order Confirmation",
      text: messageText,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, message: "Order placed successfully" });
  } catch (error) {
    console.error("Order error:", error);
    res.status(500).json({ message: "Failed to process order", error: error.message });
  }
}

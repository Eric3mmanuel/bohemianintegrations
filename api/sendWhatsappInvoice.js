// /api/sendWhatsappInvoice.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { name, email, phone, address, cart, subtotal, shipping, total } = req.body;

  const itemsText = cart.map(i => `${i.name} x${i.quantity || i.qty} = KES ${i.price}`).join("\n");
  const message = `
🌿 New Order from Website
👤 Name: ${name}
📧 Email: ${email}
📞 Phone: ${phone}
🏠 Address: ${address}

🛍️ Items:
${itemsText}

💰 Subtotal: KES ${subtotal}
🚚 Shipping: KES ${shipping}
🧾 Total: KES ${total}
`;

  try {
    await fetch(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: process.env.YOUR_PHONE_NUMBER,
        type: "text",
        text: { body: message }
      })
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("WhatsApp send error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

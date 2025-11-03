// /api/placeOrder.js
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";

function generateOrderId() {
  return "BI-" + Date.now();
}

function buildInvoicePDFBuffer({ orderId, brandName, brandLogoUrl, customer, items, subtotal, shipping, total }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      if (brandLogoUrl) {
        try {
          // if desired, doc.image can be used for local files; remote images need fetching and buffer
          // For simplicity we print brand name above — logo support can be added later if you upload the image to a public URL and fetch it first.
        } catch (e) { /* ignore image errors */ }
      }
      doc.fontSize(20).fillColor("#0b5132").text(brandName || "Bohemian Integrations", { align: "left" });
      doc.moveDown();

      doc.fontSize(12).fillColor("black").text(`Invoice: ${orderId}`);
      doc.text(`Date: ${new Date().toLocaleString()}`);
      doc.moveDown();

      // Customer details
      doc.fontSize(12).text("Bill To:", { underline: true });
      doc.text(customer.name || "");
      if (customer.email) doc.text(`Email: ${customer.email}`);
      if (customer.phone) doc.text(`Phone: ${customer.phone}`);
      if (customer.address) doc.text(`Address: ${customer.address}`);
      doc.moveDown();

      // Items
      doc.fontSize(12).text("Items:", { underline: true });
      doc.moveDown(0.2);
      items.forEach((it, i) => {
        const qty = Number(it.quantity ?? it.qty ?? 1);
        const price = Number(it.price ?? 0);
        const itemTotal = qty * price;
        doc.fontSize(11).text(`${i + 1}. ${it.name} — ${qty} × KES ${price.toFixed(2)} = KES ${itemTotal.toFixed(2)}`);
      });

      doc.moveDown();
      doc.fontSize(12).text(`Subtotal: KES ${Number(subtotal || 0).toFixed(2)}`, { align: "right" });
      doc.text(`Shipping: KES ${Number(shipping || 0).toFixed(2)}`, { align: "right" });
      doc.moveDown(0.2);
      doc.fontSize(14).text(`TOTAL: KES ${Number(total).toFixed(2)}`, { align: "right", underline: true });
      doc.moveDown(1);

      doc.fontSize(12).text("Thank you for shopping with Bohemian Integrations! 💚", { align: "center" });
      doc.moveDown();
      doc.fontSize(10).text("If you have any questions contact bohemianintegrations@gmail.com", { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function sendWhatsAppViaCallMeBot(phoneNumber, messageText, apiKey) {
  // phoneNumber should be in international format, e.g., 2547XXXXXXXX
  // CallMeBot URL format: https://api.callmebot.com/whatsapp.php?phone=+2547...&text=...&apikey=APIKEY
  try {
    const encoded = encodeURIComponent(messageText);
    const url = `https://api.callmebot.com/whatsapp.php?phone=+${phoneNumber}&text=${encoded}&apikey=${apiKey}`;
    const resp = await fetch(url);
    // CallMeBot returns "OK" text on success; ignore errors here but log
    const text = await resp.text();
    return { ok: resp.ok, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed" });

  try {
    const body = req.body || {};
    // expected fields: name, email, phone, address, cart (array of items), subtotal, shipping, total
    const name = body.name || body.customer?.name || "";
    const email = body.email || body.customer?.email || "";
    const phoneRaw = (body.phone || body.customer?.phone || "").toString();
    const address = body.address || body.customer?.address || "";
    const cart = Array.isArray(body.cart) ? body.cart : Array.isArray(body.items) ? body.items : [];
    const subtotal = Number(body.subtotal ?? cart.reduce((s, i) => s + (Number(i.price)||0) * (Number(i.quantity||i.qty)||1), 0));
    const shipping = Number(body.shipping ?? 0);
    const total = Number(body.total ?? (subtotal + shipping));

    if (!name || !email || !phoneRaw || cart.length === 0) {
      return res.status(400).json({ success: false, message: "Missing required fields (name, email, phone, cart)" });
    }

    // normalize phone: allow formats starting with 0 (07...), or 254...
    let phone = phoneRaw.replace(/[^\d]/g, "");
    if (phone.startsWith("0")) phone = "254" + phone.slice(1); // 07... -> 2547...
    // leave as-is if 254... already

    const orderId = generateOrderId();
    const brandName = process.env.BRAND_NAME || "Bohemian Integrations";
    const brandLogoUrl = process.env.BRAND_LOGO_URL || "";

    // Build PDF
    const pdfBuffer = await buildInvoicePDFBuffer({
      orderId,
      brandName,
      brandLogoUrl,
      customer: { name, email, phone, address },
      items: cart,
      subtotal,
      shipping,
      total
    });

    // Prepare plain text invoice for email body and whatsapp
    const itemLines = cart.map(it => {
      const qty = Number(it.quantity ?? it.qty ?? 1);
      const price = Number(it.price ?? 0);
      return `- ${it.name} x${qty} = KES ${(qty * price).toFixed(2)}`;
    }).join("\n");

    const textMessage = `🌿 Bohemian Integrations — Order ${orderId} 🌿

Name: ${name}
Email: ${email}
Phone: ${phone}
Address: ${address}

Items:
${itemLines}

Subtotal: KES ${subtotal.toFixed(2)}
Shipping: KES ${shipping.toFixed(2)}
TOTAL: KES ${total.toFixed(2)}

Thank you for shopping with us 💚
`;

    // 1) Send Email with Nodemailer (Gmail)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    // owner email uses GMAIL_USER (bohemianintegrations@gmail.com by default)
    const ownerEmail = process.env.GMAIL_USER;

    const mailOptionsCustomer = {
      from: `"Bohemian Integrations" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Your Bohemian Integrations Invoice — ${orderId}`,
      text: textMessage,
      attachments: [
        {
          filename: `invoice-${orderId}.pdf`,
          content: pdfBuffer
        }
      ]
    };

    const mailOptionsOwner = {
      from: `"Bohemian Integrations" <${process.env.GMAIL_USER}>`,
      to: ownerEmail,
      subject: `New Order Received — ${orderId}`,
      text: `New order ${orderId} from ${name} (${phone}, ${email}).\nTotal: KES ${total.toFixed(2)}`,
      attachments: [
        {
          filename: `invoice-${orderId}.pdf`,
          content: pdfBuffer
        }
      ]
    };

    await transporter.sendMail(mailOptionsCustomer);
    await transporter.sendMail(mailOptionsOwner);

    // 2) Send WhatsApp messages via CallMeBot to customer (if possible) and owner
    const callmeApiKey = process.env.CALLMEBOT_API_KEY || "";
    const ownerWhats = (process.env.OWNER_WHATSAPP || "254784587728").replace(/[^\d]/g, "");

    // Send to customer (best-effort)
    let waCustomerResp = null;
    if (callmeApiKey) {
      waCustomerResp = await sendWhatsAppViaCallMeBot(phone, textMessage, callmeApiKey);
    } else {
      waCustomerResp = { ok: false, error: "CALLMEBOT_API_KEY not configured" };
    }

    // Send to owner
    let waOwnerResp = null;
    if (callmeApiKey && ownerWhats) {
      waOwnerResp = await sendWhatsAppViaCallMeBot(ownerWhats, `New Order ${orderId} — Total: KES ${total.toFixed(2)}\nCustomer: ${name}, ${phone}, ${email}`, callmeApiKey);
    } else {
      waOwnerResp = { ok: false, error: "CALLMEBOT_API_KEY or OWNER_WHATSAPP not configured" };
    }

    // Done
    return res.status(200).json({
      success: true,
      orderId,
      emailSentToCustomer: true,
      emailSentToOwner: true,
      whatsappCustomer: waCustomerResp,
      whatsappOwner: waOwnerResp
    });
  } catch (err) {
    console.error("placeOrder error:", err);
    return res.status(500).json({ success: false, message: err.message || String(err) });
  }
}

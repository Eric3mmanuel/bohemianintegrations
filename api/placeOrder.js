// /api/placeOrder.js
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import fetch from "node-fetch"; // Vercel supports fetch globally, but node-fetch included for clarity

function generateOrderId() {
  return "BI-" + Date.now();
}

function normalizePhone(raw) {
  if (!raw) return "";
  let p = String(raw).replace(/[^\d]/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  return p;
}

async function buildPdfBuffer({ orderId, brandName, brandLogoUrl, customer, items, subtotal, shipping, total, thankYou }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header (logo + brand)
      if (brandLogoUrl) {
        try {
          const r = await fetch(brandLogoUrl);
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            // doc.image requires Buffer; fit it at left
            doc.image(buf, 40, 30, { width: 80, height: 80 });
          }
        } catch (e) {
          // fail softly — logo is optional
          console.warn("Logo fetch failed:", e.message || e);
        }
      }

      // Brand name to the right of logo (or at top)
      doc.fontSize(18).fillColor("#0b5132").text(brandName || "Bohemian Integrations", 140, 40);
      doc.moveDown(4);

      // Invoice meta
      doc.fontSize(12).fillColor("#000").text(`Invoice: ${orderId}`);
      doc.text(`Date: ${new Date().toLocaleString()}`);
      doc.moveDown(0.5);

      // Customer block
      doc.fontSize(12).text("Bill To:", { underline: true });
      doc.fontSize(11).text(customer.name || "");
      if (customer.email) doc.text(`Email: ${customer.email}`);
      if (customer.phone) doc.text(`Phone: ${customer.phone}`);
      if (customer.address) doc.text(`Address: ${customer.address}`);
      doc.moveDown(0.6);

      // Items
      doc.fontSize(12).text("Items:", { underline: true });
      doc.moveDown(0.2);
      items.forEach((it, i) => {
        const qty = Number(it.quantity ?? it.qty ?? 1);
        const price = Number(it.price ?? 0);
        const line = `${i + 1}. ${it.name} — ${qty} × KES ${price.toFixed(2)} = KES ${(qty * price).toFixed(2)}`;
        doc.fontSize(11).text(line);
      });
      doc.moveDown(0.6);

      // Totals
      doc.fontSize(12).text(`Subtotal: KES ${Number(subtotal || 0).toFixed(2)}`, { align: "right" });
      doc.fontSize(12).text(`Shipping: KES ${Number(shipping || 0).toFixed(2)}`, { align: "right" });
      doc.moveDown(0.2);
      doc.fontSize(14).text(`TOTAL: KES ${Number(total || (subtotal + shipping)).toFixed(2)}`, { align: "right", underline: true });
      doc.moveDown(1);

      // Thank you / footer
      doc.fontSize(12).fillColor("#0b5132").text(thankYou || "", { align: "center" });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor("#444").text("If you have any questions contact bohemianintegrations@gmail.com", { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function sendWhatsAppViaCallMeBot(phone, text, apiKey) {
  try {
    // phone should be like '2547XXXXXXXX' or with + - we'll prefix + for the URL param
    const phoneClean = phone.replace(/[^\d]/g, "");
    const encoded = encodeURIComponent(text);
    const url = `https://api.callmebot.com/whatsapp.php?phone=+${phoneClean}&text=${encoded}&apikey=${apiKey}`;
    const r = await fetch(url);
    const txt = await r.text();
    return { ok: r.ok, status: r.status, text: txt };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export default async function handler(req, res) {
  // Always return JSON
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Method not allowed" });
    }

    const body = req.body || {};
    const name = body.name || body.customer?.name || "";
    const email = body.email || body.customer?.email || "";
    const phoneRaw = body.phone || body.customer?.phone || "";
    const address = body.address || body.customer?.address || "";
    const cart = Array.isArray(body.cart) ? body.cart : Array.isArray(body.items) ? body.items : [];
    const subtotal = Number(body.subtotal ?? cart.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity || i.qty) || 1), 0));
    const shipping = Number(body.shipping ?? 0);
    const total = Number(body.total ?? subtotal + shipping);

    if (!name || !email || !phoneRaw || cart.length === 0) {
      return res.status(400).json({ success: false, message: "Missing required fields: name, email, phone or cart is empty." });
    }

    // normalize phone for sending (customer)
    const customerPhone = normalizePhone(phoneRaw);
    const ownerWhats = (process.env.OWNER_WHATSAPP || "254784587728").replace(/[^\d]/g, "");

    const orderId = generateOrderId();
    const brandName = process.env.BRAND_NAME || "Bohemian Integrations";
    const brandLogoUrl = process.env.BRAND_LOGO_URL || "";
    const thankYouMessage = process.env.THANK_YOU_MESSAGE || "Thank you for choosing Bohemian Integrations 🙏- may abundance find you ,always💚";

    // Build PDF invoice
    const pdfBuffer = await buildPdfBuffer({
      orderId,
      brandName,
      brandLogoUrl,
      customer: { name, email, phone: customerPhone, address },
      items: cart,
      subtotal,
      shipping,
      total,
      thankYou: thankYouMessage
    });

    // Build text summary (friendly)
    const itemLines = cart.map((it) => {
      const qty = Number(it.quantity ?? it.qty ?? 1);
      const price = Number(it.price ?? 0);
      return `- ${it.name} x${qty} = KES ${(qty * price).toFixed(2)}`;
    }).join("\n");

    const textSummary = `🌿 Bohemian Integrations — Order ${orderId} 🌿

Name: ${name}
Email: ${email}
Phone: ${customerPhone}
Address: ${address}

Items:
${itemLines}

Subtotal: KES ${subtotal.toFixed(2)}
Shipping: KES ${shipping.toFixed(2)}
TOTAL: KES ${total.toFixed(2)}

${thankYouMessage}
`;

    // --- SEND EMAILs via Nodemailer (Gmail SMTP) ---
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;
    if (!gmailUser || !gmailPass) {
      return res.status(500).json({ success: false, message: "Email credentials not configured (GMAIL_USER / GMAIL_PASS)." });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass }
    });

    // Mail to customer
    const mailCustomer = {
      from: `"Bohemian Integrations" <${gmailUser}>`,
      to: email,
      subject: `Your Bohemian Integrations Invoice — ${orderId}`,
      text: textSummary,
      attachments: [{ filename: `invoice-${orderId}.pdf`, content: pdfBuffer }]
    };

    // Mail to owner
    const ownerEmail = gmailUser;
    const mailOwner = {
      from: `"Bohemian Integrations" <${gmailUser}>`,
      to: ownerEmail,
      subject: `New Order Received — ${orderId}`,
      text: `New order ${orderId} from ${name} (${customerPhone}, ${email}). Total: KES ${total.toFixed(2)}`,
      attachments: [{ filename: `invoice-${orderId}.pdf`, content: pdfBuffer }]
    };

    // send email(s)
    await transporter.sendMail(mailCustomer);
    await transporter.sendMail(mailOwner);

    // --- SEND WhatsApp via CallMeBot (best-effort)
    const callmeKey = process.env.CALLMEBOT_API_KEY;
    let waCustomerResp = { ok: false, note: "CALLMEBOT not configured" };
    let waOwnerResp = { ok: false, note: "CALLMEBOT not configured" };

    if (callmeKey) {
      // send to customer
      try {
        waCustomerResp = await sendWhatsAppViaCallMeBot(customerPhone, textSummary, callmeKey);
      } catch (e) {
        waCustomerResp = { ok: false, error: e.message || String(e) };
      }
      // send to owner
      try {
        waOwnerResp = await sendWhatsAppViaCallMeBot(ownerWhats, `New Order ${orderId} — KES ${total.toFixed(2)}\nCustomer: ${name} ${customerPhone} ${email}`, callmeKey);
      } catch (e) {
        waOwnerResp = { ok: false, error: e.message || String(e) };
      }
    }

    // Respond with JSON
    return res.status(200).json({
      success: true,
      orderId,
      emails: { customer: email, owner: ownerEmail },
      whatsapp: { customer: waCustomerResp, owner: waOwnerResp }
    });

  } catch (err) {
    console.error("placeOrder error:", err);
    // Always return JSON error
    return res.status(500).json({ success: false, message: "Server error: " + (err.message || String(err)) });
  }
}
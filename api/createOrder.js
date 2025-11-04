

// File: /api/createOrder.js

import PDFDocument from "pdfkit";

import streamBuffers from "stream-buffers";

/**

Expected request body:

{

customer: { name, phone, email, address },

items: [{ id, name, price, quantity, image? }],

subtotal: number,

shipping: number,

total: number,

orderId?: string (optional)

}

Environment variables required:

SENDGRID_API_KEY

SENDGRID_FROM

WHATSAPP_TOKEN

WHATSAPP_PHONE_ID

OWNER_WHATSAPP

PUBLIC_BASE_URL (optional - where to host invoice PDFs if you want WhatsApp document)


*/

function generateOrderId() {

return "BI-" + Date.now();

}

function generatePDFBuffer({ orderId, brandName, brandLogoUrl, customer, items, subtotal, shipping, total }) {

return new Promise((resolve, reject) => {

try {

  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const writable = new streamBuffers.WritableStreamBuffer({

    initialSize: (100 * 1024),   // start at 100 kilobytes.

    incrementAmount: (10 * 1024) // grow by 10 kilobytes each time buffer overflows.

  });



  // Header: logo + brand

  if (brandLogoUrl) {

    // pdfkit can accept remote images only if the image is a Buffer. We skip remote loading here.

    // You can embed a local logo by reading it and using doc.image(path,...)

  }

  doc.fontSize(20).text(brandName || "Bohemian Integrations", { align: "left" });

  doc.moveDown();



  doc.fontSize(12).text(`Invoice: ${orderId}`);

  doc.text(`Date: ${new Date().toLocaleString()}`);

  doc.moveDown();



  // Customer

  doc.fontSize(12).text("Bill To:", { underline: true });

  doc.text(`${customer.name}`);

  if (customer.email) doc.text(`Email: ${customer.email}`);

  if (customer.phone) doc.text(`Phone: ${customer.phone}`);

  if (customer.address) doc.text(`Address: ${customer.address}`);

  doc.moveDown();



  // Items table header

  doc.fontSize(12).text("Items:", { underline: true });

  doc.moveDown(0.3);



  // Table columns: Name | Qty | Price | Total

  items.forEach(it => {

    const itemTotal = (Number(it.price) || 0) * (Number(it.quantity) || 1);

    doc.fontSize(11).text(`${it.name} — ${it.quantity} × KES ${Number(it.price).toFixed(2)} = KES ${itemTotal.toFixed(2)}`);

  });

  doc.moveDown();



  // Totals

  doc.fontSize(12).text(`Subtotal: KES ${Number(subtotal).toFixed(2)}`, { align: "right" });

  doc.text(`Shipping: KES ${Number(shipping).toFixed(2)}`, { align: "right" });

  doc.moveDown(0.2);

  doc.fontSize(14).text(`TOTAL: KES ${Number(total).toFixed(2)}`, { align: "right", underline: true });

  doc.moveDown(1);



  doc.fontSize(12).text("Thank you for shopping with Bohemian Integrations! 💚", { align: "center" });

  doc.moveDown();

  doc.fontSize(10).text("We appreciate your trust. If you have any questions contact info@bohemianintegrations.com", { align: "center" });



  doc.end();

  doc.pipe(writable);



  writable.on("finish", () => {

    const buffer = writable.getBuffer();

    resolve(buffer);

  });

  writable.on("error", (err) => reject(err));

} catch (err) {

  reject(err);

}

});

}

async function sendEmailWithAttachment({ to, subject, html, attachmentBuffer, filename }) {

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

if (!SENDGRID_API_KEY) throw new Error("SENDGRID_API_KEY not configured");

const body = {

personalizations: [{ to: [{ email: to }] }],

from: { email: process.env.SENDGRID_FROM || "no-reply@bohemianintegrations.shop", name: "Bohemian Integrations" },

subject,

content: [{ type: "text/html", value: html }],

attachments: [

  {

    content: attachmentBuffer.toString("base64"),

    filename: filename,

    type: "application/pdf",

    disposition: "attachment"

  }

]

};

const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {

method: "POST",

headers: {

  Authorization: `Bearer ${SENDGRID_API_KEY}`,

  "Content-Type": "application/json"

},

body: JSON.stringify(body)

});

if (!resp.ok) {

const txt = await resp.text();

throw new Error("SendGrid error: " + txt);

}

}

// WhatsApp text (simple)

async function sendWhatsAppText(toPhone, messageText) {

// toPhone should be in '2547XXXXXXXX' format

const token = process.env.WHATSAPP_TOKEN;

const phoneId = process.env.WHATSAPP_PHONE_ID;

if (!token || !phoneId) {

console.warn("WhatsApp env not configured. Skipping WhatsApp message.");

return;

}

const url = https://graph.facebook.com/v17.0/${phoneId}/messages;

const body = {

messaging_product: "whatsapp",

to: toPhone,

text: { body: messageText }

};

const res = await fetch(url, {

method: "POST",

headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },

body: JSON.stringify(body)

});

if (!res.ok) {

const txt = await res.text();

console.error("WhatsApp API error:", txt);

}

}

export default async function handler(req, res) {

if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

try {

const payload = req.body;

// Validate / sanitize

const customer = payload.customer || {};

const items = Array.isArray(payload.items) ? payload.items : [];

const subtotal = Number(payload.subtotal || 0);

const shipping = Number(payload.shipping || 0);

const total = Number(payload.total || (subtotal + shipping));

const brandName = process.env.BRAND_NAME || "Bohemian Integrations";

const brandLogoUrl = process.env.BRAND_LOGO_URL || "";



const orderId = payload.orderId || generateOrderId();



// 1) Generate PDF invoice buffer

const pdfBuffer = await generatePDFBuffer({ orderId, brandName, brandLogoUrl, customer, items, subtotal, shipping, total });



// 2) Email PDF to customer and to owner

const subject = `Bohemian Integrations — Your Order ${orderId}`;

const htmlContent = `

  <div style="font-family: Arial, Helvetica, sans-serif; color:#1a4d2e;">

    <h2>Thank you for your order — ${brandName}</h2>

    <p>Hello ${customer.name || ""},</p>

    <p>We have received your order <strong>${orderId}</strong>. Attached is your order invoice.</p>

    <p>Order total: <strong>KES ${Number(total).toFixed(2)}</strong></p>

    <p>We will contact you on ${customer.phone || ""} for delivery details.</p>

    <p style="margin-top:18px">With warm regards,<br/>${brandName}</p>

  </div>

`;



// Send to customer (if email exists)

if (customer.email) {

  await sendEmailWithAttachment({

    to: customer.email,

    subject,

    html: htmlContent,

    attachmentBuffer: pdfBuffer,

    filename: `invoice-${orderId}.pdf`

  });

}



// Send to owner/business

const ownerEmail = process.env.SENDGRID_FROM || "info@bohemianintegrations.com";

await sendEmailWithAttachment({

  to: ownerEmail,

  subject: `New order received — ${orderId}`,

  html: `<p>New order ${orderId} from ${customer.name || "unknown"}. See attached invoice.</p>`,

  attachmentBuffer: pdfBuffer,

  filename: `invoice-${orderId}.pdf`

});



// 3) Send WhatsApp text summary (PDF via WhatsApp requires a public URL; see notes below)

const customerMsg = `Hi ${customer.name || ""}! Your order ${orderId} has been placed. Total: KES ${Number(total).toFixed(2)}. We emailed your invoice. Thank you — Bohemian Integrations.`;

const ownerMsg = `New Order ${orderId} — KES ${Number(total).toFixed(2)}. Customer: ${customer.name || ""}, ${customer.phone || ""}, ${customer.email || ""}.`;



if (customer.phone) {

  // Normalize phone: allow inputs like 07xxxxxxxx or 2547xxxxxxxx

  let cphone = customer.phone.replace(/[^\d]/g, "");

  if (cphone.startsWith("0")) cphone = "254" + cphone.slice(1);

  if (!cphone.startsWith("254")) cphone = cphone; // assume provided correctly

  await sendWhatsAppText(cphone, customerMsg);

}



const ownerPhone = process.env.OWNER_WHATSAPP;

if (ownerPhone) {

  await sendWhatsAppText(ownerPhone, ownerMsg);

}



// 4) Optionally: store order record (left as TODO; you should persist to DB)

// TODO: save order to DB along with orderId, pdf (or storage link), status = 'placed'



// 5) Response

return res.json({ ok: true, orderId, message: "Order created, invoice emailed and WhatsApp sent (if configured)." });

} catch (err) {

console.error("createOrder error:", err);

return res.status(500).json({ ok: false, error: err.message || String(err) });

}
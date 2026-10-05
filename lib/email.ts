import nodemailer from "nodemailer";
import type { ProductHit } from "./types";

function transport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Missing Gmail environment variables");
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

function esc(value: string) {
  return value.replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

export async function sendStockAlert(items: ProductHit[]) {
  if (!items.length) return;
  const to = process.env.ALERT_EMAIL || process.env.GMAIL_USER;
  const from = process.env.GMAIL_USER;
  if (!to || !from) throw new Error("Missing alert email configuration");
  const rows = items.map((x) => `
    <div style="margin:0 0 18px;padding:16px;border:1px solid #ddd;border-radius:12px">
      <div style="font-size:12px;color:#666">${esc(x.storeName)}${x.location ? ` • ${esc(x.location)}` : ""}</div>
      <div style="font-size:18px;font-weight:700;margin:5px 0">${esc(x.name)}</div>
      ${x.price ? `<div><b>Price:</b> ${esc(x.price)}</div>` : ""}
      ${x.purchaseLimit ? `<div><b>Limit:</b> ${esc(x.purchaseLimit)}</div>` : ""}
      <div style="margin-top:12px"><a href="${esc(x.url)}" style="background:#111;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none">Open product</a></div>
    </div>`).join("");

  await transport().sendMail({
    from: `PokeDexAlert <${from}>`,
    to,
    subject: `🚨 Pokémon 30th stock alert — ${items.length} item${items.length === 1 ? "" : "s"}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto"><h2>Pokémon 30th Anniversary stock detected</h2><p>These products changed to available:</p>${rows}<p style="font-size:12px;color:#777">PokeDexAlert only notifies you. Checkout remains manual.</p></div>`,
  });
}

export async function sendTestEmail() {
  const to = process.env.ALERT_EMAIL || process.env.GMAIL_USER;
  const from = process.env.GMAIL_USER;
  if (!to || !from) throw new Error("Missing alert email configuration");
  await transport().sendMail({
    from: `PokeDexAlert <${from}>`,
    to,
    subject: "✅ PokeDexAlert test successful",
    html: "<h2>PokeDexAlert is connected.</h2><p>Your email alert configuration is working.</p>",
  });
}

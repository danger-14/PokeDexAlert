import nodemailer from "nodemailer";
import type { Product } from "./types";

export type MailDeliveryResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response?: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]!,
  );
}

function getMailConfig() {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

  if (!gmailUser || !gmailAppPassword) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD");
  }

  const alertEmail = process.env.ALERT_EMAIL?.trim() || gmailUser;

  return {
    gmailUser,
    gmailAppPassword,
    alertEmail,
  };
}

function createTransporter(gmailUser: string, gmailAppPassword: string) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });
}

function addresses(values: unknown) {
  if (!Array.isArray(values)) return [];

  return values.map((value) => {
    if (typeof value === "string") return value;

    if (value && typeof value === "object" && "address" in value) {
      const address = (value as { address?: unknown }).address;
      if (typeof address === "string") return address;
    }

    return String(value);
  });
}

function deliveryResult(info: {
  messageId?: unknown;
  accepted?: unknown;
  rejected?: unknown;
  response?: unknown;
}): MailDeliveryResult {
  const accepted = addresses(info.accepted);
  const rejected = addresses(info.rejected);

  if (accepted.length === 0) {
    throw new Error(
      `Gmail did not accept the alert email.${
        rejected.length > 0 ? ` Rejected: ${rejected.join(", ")}` : ""
      }`,
    );
  }

  return {
    messageId: String(info.messageId || "unknown"),
    accepted,
    rejected,
    response:
      typeof info.response === "string" ? info.response : undefined,
  };
}

export async function sendStockAlert(products: Product[]) {
  if (products.length === 0) {
    throw new Error("sendStockAlert was called without any products.");
  }

  const { gmailUser, gmailAppPassword, alertEmail } = getMailConfig();
  const transporter = createTransporter(gmailUser, gmailAppPassword);

  const productList = products
    .map(
      (product) => `
        <li style="margin:0 0 18px;">
          <strong>${escapeHtml(product.title)}</strong><br>
          ${escapeHtml(product.store)}
          ${product.price ? ` · ${escapeHtml(product.price)}` : ""}
          ${
            product.sku
              ? `<br>EAN/SKU: ${escapeHtml(product.sku)}`
              : ""
          }
          ${
            product.statusText
              ? `<br>Status: ${escapeHtml(product.statusText)}`
              : ""
          }
          <br>
          <a
            href="${escapeHtml(product.url)}"
            style="display:inline-block;margin-top:7px;padding:10px 16px;background:#2563eb;color:white;text-decoration:none;border-radius:8px;"
          >
            Open product
          </a>
        </li>
      `,
    )
    .join("");

  const subject =
    products.length === 1
      ? `AVAILABLE: ${products[0].title}`
      : `AVAILABLE: ${products.length} Pokémon products`;

  const text = products
    .map(
      (product) =>
        `${product.title}\n${product.store}${
          product.price ? ` · ${product.price}` : ""
        }${product.sku ? `\nEAN/SKU: ${product.sku}` : ""}${
          product.statusText ? `\nStatus: ${product.statusText}` : ""
        }\n${product.url}`,
    )
    .join("\n\n");

  const info = await transporter.sendMail({
    from: `PokeDexAlert <${gmailUser}>`,
    to: alertEmail,
    subject,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;">
        <h1>Pokémon product available</h1>
        <p>
          PokeDexAlert detected a monitored product that is currently
          available to order or buy. Availability can change quickly.
        </p>
        <ul>${productList}</ul>
      </div>
    `,
  });

  return deliveryResult(info);
}

export async function sendTestAlert(product: Product) {
  const { gmailUser, gmailAppPassword, alertEmail } = getMailConfig();
  const transporter = createTransporter(gmailUser, gmailAppPassword);

  const info = await transporter.sendMail({
    from: `PokeDexAlert <${gmailUser}>`,
    to: alertEmail,
    subject: `TEST ALERT: ${product.title}`,
    text:
      `This is a PokeDexAlert test.\n\n${product.title}\n` +
      `${product.store}\n${product.url}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;">
        <h1>PokeDexAlert test successful</h1>
        <p>This is a test only. No purchase was made.</p>
        <p>
          <strong>${escapeHtml(product.title)}</strong><br>
          ${escapeHtml(product.store)}
        </p>
        <a
          href="${escapeHtml(product.url)}"
          style="display:inline-block;padding:10px 16px;background:#2563eb;color:white;text-decoration:none;border-radius:8px;"
        >
          Open test product
        </a>
      </div>
    `,
  });

  return deliveryResult(info);
}

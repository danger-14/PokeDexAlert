import nodemailer from "nodemailer";
import type { Product } from "./types";

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

export async function sendStockAlert(products: Product[]) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword =
    process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

  const alertEmail =
    process.env.ALERT_EMAIL || "dangeraldcruz@gmail.com";

  if (!gmailUser || !gmailAppPassword) {
    throw new Error(
      "Missing GMAIL_USER or GMAIL_APP_PASSWORD",
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });

  const productList = products
    .map(
      (product) => `
        <li style="margin: 0 0 18px;">
          <strong>${escapeHtml(product.title)}</strong><br>
          ${escapeHtml(product.store)}
          ${
            product.price
              ? ` · ${escapeHtml(product.price)}`
              : ""
          }
          <br>
          <a
            href="${escapeHtml(product.url)}"
            style="
              display: inline-block;
              margin-top: 7px;
              padding: 10px 16px;
              background: #2563eb;
              color: white;
              text-decoration: none;
              border-radius: 8px;
            "
          >
            Buy or preorder now
          </a>
        </li>
      `,
    )
    .join("");

  const subject =
    products.length === 1
      ? `IN STOCK: ${products[0].title}`
      : `IN STOCK: ${products.length} Pokémon 30th products`;

  const text = products
    .map(
      (product) =>
        `${product.title}\n${product.store}${
          product.price ? ` · ${product.price}` : ""
        }\n${product.url}`,
    )
    .join("\n\n");

  await transporter.sendMail({
    from: `PokeDexAlert <${gmailUser}>`,
    to: alertEmail,
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px;">
        <h1>Pokémon 30th product available</h1>

        <p>
          Availability can change quickly. Open the product and use
          your browser's saved checkout details.
        </p>

        <ul>
          ${productList}
        </ul>
      </div>
    `,
  });
}

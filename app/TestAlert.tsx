"use client";

import { FormEvent, useState } from "react";

export default function TestAlert() {
  const [productUrl, setProductUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function sendTest(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage("");

    try {
      const response = await fetch("/api/test-alert", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ productUrl, productName, storeName }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not send test alert.");
      }

      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="test-alert">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Email verification</span>
          <h2>Test an alert</h2>
        </div>
      </div>

      <p>
        Add any specific product link and send a test email immediately.
        This checks the alert and direct link without buying anything.
      </p>

      <form onSubmit={sendTest}>
        <label>
          Product URL
          <input type="url" value={productUrl} onChange={(event) => setProductUrl(event.target.value)} placeholder="https://store.fi/product/..." required />
        </label>
        <label>
          Product name (optional)
          <input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="30th Anniversary ETB" maxLength={160} />
        </label>
        <label>
          Store name (optional)
          <input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Prisma" maxLength={80} />
        </label>
        <label>
          Admin password
          <input type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} placeholder="Your ADMIN_SECRET" required autoComplete="current-password" />
        </label>
        <button type="submit" disabled={sending}>
          {sending ? "Sending test..." : "Send test alert"}
        </button>
      </form>

      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}

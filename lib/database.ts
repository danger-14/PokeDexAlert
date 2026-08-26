import type { Product, StoredProduct } from "./types";

function getDatabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return {
    endpoint: `${supabaseUrl}/rest/v1/stock_alert_state`,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
  };
}

export async function loadState() {
  const { endpoint, headers } = getDatabaseConfig();

  const response = await fetch(
    `${endpoint}?select=product_url,available,last_title,last_store`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not load alert state: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as StoredProduct[];
}

export async function saveState(
  products: Product[],
  alertedUrls: Set<string>,
) {
  if (products.length === 0) {
    return;
  }

  const { endpoint, headers } = getDatabaseConfig();
  const now = new Date().toISOString();

  const rows = products.map((product) => ({
    product_url: product.url,
    available: product.available,
    last_title: product.title,
    last_store: product.store,
    last_seen_at: now,
    ...(alertedUrls.has(product.url)
      ? { last_alerted_at: now }
      : {}),
  }));

  const response = await fetch(
    `${endpoint}?on_conflict=product_url`,
    {
      method: "POST",
      headers: {
        ...headers,
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not save alert state: ${response.status} ${await response.text()}`,
    );
  }
}

import type {
  MonitoredStore,
  Product,
  StoredProduct,
} from "./types";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return {
    supabaseUrl,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
  };
}

export async function loadState() {
  const { supabaseUrl, headers } = getSupabaseConfig();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/stock_alert_state` +
      "?select=product_url,available,last_title,last_store",
    {
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not load alert state: ${response.status} ` +
        `${await response.text()}`,
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

  const { supabaseUrl, headers } = getSupabaseConfig();
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
    `${supabaseUrl}/rest/v1/stock_alert_state` +
      "?on_conflict=product_url",
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
      `Could not save alert state: ${response.status} ` +
        `${await response.text()}`,
    );
  }
}

export async function loadMonitoredStores() {
  const { supabaseUrl, headers } = getSupabaseConfig();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/monitored_stores` +
      "?select=id,name,listing_url,enabled,created_at" +
      "&enabled=eq.true&order=created_at.asc",
    {
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not load monitored stores: ${response.status} ` +
        `${await response.text()}`,
    );
  }

  return (await response.json()) as MonitoredStore[];
}

export async function createMonitoredStore(
  name: string,
  listingUrl: string,
) {
  const { supabaseUrl, headers } = getSupabaseConfig();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/monitored_stores`,
    {
      method: "POST",
      headers: {
        ...headers,
        prefer: "return=representation",
      },
      body: JSON.stringify({
        name,
        listing_url: listingUrl,
        enabled: true,
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text();

    if (response.status === 409) {
      throw new Error("That store URL is already being monitored.");
    }

    throw new Error(
      `Could not add store: ${response.status} ${message}`,
    );
  }

  const stores = (await response.json()) as MonitoredStore[];
  return stores[0];
}

export async function deleteMonitoredStore(id: string) {
  const { supabaseUrl, headers } = getSupabaseConfig();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/monitored_stores` +
      `?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        ...headers,
        prefer: "return=minimal",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not remove store: ${response.status} ` +
        `${await response.text()}`,
    );
  }
}

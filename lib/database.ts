import type {
  MonitoredStore,
  Product,
  StoredProduct,
} from "./types";

function getSupabaseConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return {
    supabaseUrl,

    headers: {
      apikey:
        serviceRoleKey,

      authorization:
        `Bearer ${serviceRoleKey}`,

      "content-type":
        "application/json",
    },
  };
}

/* =====================================================
   ALERT STATE
   ===================================================== */

export async function loadState() {
  const {
    supabaseUrl,
    headers,
  } =
    getSupabaseConfig();

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/stock_alert_state` +
        "?select=product_url,available,last_title,last_store",
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

  return (
    await response.json()
  ) as StoredProduct[];
}

export async function saveState(
  products: Product[],
  alertedUrls: Set<string>,
) {
  if (
    products.length === 0
  ) {
    return;
  }

  const {
    supabaseUrl,
    headers,
  } =
    getSupabaseConfig();

  const now =
    new Date().toISOString();

  const rows =
    products.map(
      (product) => ({
        product_url:
          product.url,

        available:
          product.available,

        last_title:
          product.title,

        last_store:
          product.store,

        last_seen_at:
          now,

        ...(alertedUrls.has(
          product.url,
        )
          ? {
              last_alerted_at:
                now,
            }
          : {}),
      }),
    );

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/stock_alert_state?on_conflict=product_url`,
      {
        method: "POST",

        headers: {
          ...headers,

          prefer:
            "resolution=merge-duplicates,return=minimal",
        },

        body:
          JSON.stringify(rows),
      },
    );

  if (!response.ok) {
    throw new Error(
      `Could not save alert state: ${response.status} ${await response.text()}`,
    );
  }
}

/* =====================================================
   MONITORED PRODUCTS
   ===================================================== */

export async function loadMonitoredStores() {
  const {
    supabaseUrl,
    headers,
  } =
    getSupabaseConfig();

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/monitored_stores` +
        "?select=id,name,product_name,listing_url,enabled,created_at" +
        "&enabled=eq.true" +
        "&order=created_at.asc",
      {
        headers,
        cache: "no-store",
      },
    );

  if (!response.ok) {
    throw new Error(
      `Could not load monitored products: ${response.status} ${await response.text()}`,
    );
  }

  return (
    await response.json()
  ) as MonitoredStore[];
}

/* =====================================================
   ADD PRODUCT
   ===================================================== */

export async function createMonitoredStore(
  name: string,
  productName: string,
  productUrl: string,
) {
  const {
    supabaseUrl,
    headers,
  } =
    getSupabaseConfig();

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/monitored_stores`,
      {
        method: "POST",

        headers: {
          ...headers,

          prefer:
            "return=representation",
        },

        body:
          JSON.stringify({
            name,

            product_name:
              productName,

            listing_url:
              productUrl,

            enabled: true,
          }),
      },
    );

  if (!response.ok) {
    throw new Error(
      `Could not add monitored product: ${response.status} ${await response.text()}`,
    );
  }

  const rows =
    (await response.json()) as MonitoredStore[];

  return rows[0];
}

/* =====================================================
   EDIT INDIVIDUAL PRODUCT
   ===================================================== */

export async function updateMonitoredProduct(
  id: string,
  productName: string,
  productUrl: string,
) {
  const {
    supabaseUrl,
    headers,
  } =
    getSupabaseConfig();

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/monitored_stores?id=eq.${encodeURIComponent(
        id,
      )}`,
      {
        method: "PATCH",

        headers: {
          ...headers,

          prefer:
            "return=minimal",
        },

        body:
          JSON.stringify({
            product_name:
              productName,

            listing_url:
              productUrl,
          }),
      },
    );

  if (!response.ok) {
    throw new Error(
      `Could not update product: ${response.status} ${await response.text()}`,
    );
  }
}

/* =====================================================
   RENAME STORE
   ===================================================== */

export async function renameMonitoredStore(
  oldName: string,
  newName: string,
) {
  const {
    supabaseUrl,
    headers,
  } =
    getSupabaseConfig();

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/monitored_stores?name=eq.${encodeURIComponent(
        oldName,
      )}`,
      {
        method: "PATCH",

        headers: {
          ...headers,

          prefer:
            "return=minimal",
        },

        body:
          JSON.stringify({
            name:
              newName,
          }),
      },
    );

  if (!response.ok) {
    throw new Error(
      `Could not rename store: ${response.status} ${await response.text()}`,
    );
  }
}

/* =====================================================
   REMOVE ONE PRODUCT
   ===================================================== */

export async function deleteMonitoredStore(
  id: string,
) {
  const {
    supabaseUrl,
    headers,
  } =
    getSupabaseConfig();

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/monitored_stores?id=eq.${encodeURIComponent(
        id,
      )}`,
      {
        method: "DELETE",

        headers: {
          ...headers,

          prefer:
            "return=minimal",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `Could not remove product: ${response.status} ${await response.text()}`,
    );
  }
}

/* =====================================================
   REMOVE WHOLE STORE
   ===================================================== */

export async function deleteMonitoredStoreGroup(
  name: string,
) {
  const {
    supabaseUrl,
    headers,
  } =
    getSupabaseConfig();

  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/monitored_stores?name=eq.${encodeURIComponent(
        name,
      )}`,
      {
        method: "DELETE",

        headers: {
          ...headers,

          prefer:
            "return=minimal",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `Could not remove store: ${response.status} ${await response.text()}`,
    );
  }
}

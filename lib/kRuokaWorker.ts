import {
  detectProductType,
  productMatchScore,
  productSearchVariants,
  resolveProductIdentity,
} from "./productTerms";
import type {
  MonitoredStore,
  Product,
  ProductIdentity,
} from "./types";

type WorkerProduct = {
  id: string;
  name: string;
  ean: string;
  price: number | null;
  brand: string | null;
  category: string | null;
  isAvailable: boolean | null;
  availability: {
    store: boolean | null;
    web: boolean | null;
  };
  storeId: string | null;
  url: string | null;
  imageUrl: string | null;
};

type WorkerResponse = {
  ok: boolean;
  error?: string;
  store?: {
    id: string;
    name: string;
    location?: unknown;
  };
  query?: string;
  products?: WorkerProduct[];
  checkedAt?: string;
};

function configuredWorker() {
  const baseUrl = process.env.KRUOKA_WORKER_URL?.trim().replace(/\/$/, "");
  const secret = process.env.KRUOKA_WORKER_SECRET?.trim();

  if (!baseUrl || !secret) {
    throw new Error(
      "K-Ruoka worker is not configured. Set KRUOKA_WORKER_URL and KRUOKA_WORKER_SECRET in Vercel.",
    );
  }

  return { baseUrl, secret };
}

function euro(price: number | null) {
  if (price === null) return undefined;
  return `${price.toFixed(2).replace(".", ",")} €`;
}

function buildQueries(
  wanted: string,
  identity: ProductIdentity | null,
) {
  const queries = new Set<string>(
    productSearchVariants(wanted, identity),
  );

  const type = identity?.productType || detectProductType(wanted);

  if (type === "etb") queries.add("Elite Trainer Box");
  if (type === "upc") queries.add("Ultra Premium Collection");
  if (type === "booster_box") queries.add("Booster Box");
  if (type === "booster_bundle") queries.add("Booster Bundle");
  if (type === "binder") queries.add("Binder Collection");
  if (type === "poster") queries.add("Poster Collection");
  if (type === "blister") queries.add("Blister");
  if (type === "tin") queries.add("Pokemon Tin");

  queries.add("Pokemon");

  return [...queries].map((query) => query.trim()).filter(Boolean);
}

async function callWorker(
  baseUrl: string,
  secret: string,
  storeName: string,
  query: string,
): Promise<WorkerResponse> {
  const response = await fetch(`${baseUrl}/search`, {
    method: "POST",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      storeName,
      limit: 50,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  let payload: WorkerResponse;

  try {
    payload = (await response.json()) as WorkerResponse;
  } catch {
    throw new Error(
      `K-Ruoka worker returned HTTP ${response.status} with an unreadable response.`,
    );
  }

  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.error || `K-Ruoka worker returned HTTP ${response.status}.`,
    );
  }

  return payload;
}

function scoreWorkerProduct(
  product: WorkerProduct,
  wanted: string,
  identity: ProductIdentity | null,
) {
  if (
    identity?.ean &&
    product.ean &&
    product.ean === identity.ean
  ) {
    return 100;
  }

  if (
    identity?.ean &&
    product.ean &&
    product.ean !== identity.ean
  ) {
    return 0;
  }

  return productMatchScore(product.name, wanted, identity);
}

export async function scanKRuokaWorker(
  target: MonitoredStore,
  suppliedIdentity?: ProductIdentity | null,
): Promise<Product> {
  const wanted = target.product_name?.trim() || target.name;
  const identity = suppliedIdentity ?? resolveProductIdentity(wanted);
  const { baseUrl, secret } = configuredWorker();

  const productMap = new Map<string, WorkerProduct>();
  let lastPayload: WorkerResponse | null = null;

  for (const query of buildQueries(wanted, identity)) {
    const payload = await callWorker(
      baseUrl,
      secret,
      target.name,
      query,
    );

    lastPayload = payload;

    for (const product of payload.products || []) {
      productMap.set(product.ean || product.id, product);
    }

    const bestSoFar = [...productMap.values()]
      .map((product) => scoreWorkerProduct(product, wanted, identity))
      .sort((a, b) => b - a)[0];

    if ((bestSoFar || 0) >= 100) break;
  }

  const products = [...productMap.values()];
  const payload = lastPayload || { ok: true, products: [] };

  const ranked = products
    .map((product) => ({
      product,
      score: scoreWorkerProduct(product, wanted, identity),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < 70) {
    return {
      monitorId: target.id,
      identityKey: identity?.key,
      ean: identity?.ean,
      store: target.name,
      title: identity?.canonicalName || wanted,
      url: target.listing_url,
      sku: identity?.ean,
      statusText: "Product not found at this store",
      state: "unknown",
      available: false,
      evidence: [
        `K-Ruoka worker checked ${payload.store?.name || target.name}.`,
        identity?.ean
          ? `Expected EAN: ${identity.ean}.`
          : `No canonical EAN is known for "${wanted}".`,
        ranked[0]
          ? `Closest product match score: ${ranked[0].score}/100.`
          : "K-Ruoka returned no matching products.",
      ],
    };
  }

  const product = best.product;
  const isAvailable = product.isAvailable === true;
  const webAvailable = product.availability.web === true;
  const storeAvailable = product.availability.store === true;
  const available = isAvailable && (webAvailable || storeAvailable);

  const statusText = available
    ? webAvailable && storeAvailable
      ? "Available at Jumbo (store + web)"
      : webAvailable
        ? "Available online at Jumbo"
        : "Available at Jumbo store"
    : isAvailable
      ? "Listed, but sales channel unavailable"
      : "Unavailable at Jumbo";

  return {
    monitorId: target.id,
    identityKey: identity?.key,
    storeProductId: product.id,
    ean: product.ean || identity?.ean,
    store: target.name,
    title: product.name,
    url: product.url || target.listing_url,
    price: euro(product.price),
    sku: product.ean || identity?.ean,
    stockText: statusText,
    statusText,
    state: available ? "in_stock" : "out_of_stock",
    available,
    evidence: [
      `K-Ruoka store: ${payload.store?.name || target.name}`,
      `Store ID: ${payload.store?.id || product.storeId || "unknown"}`,
      identity?.ean
        ? `Canonical EAN: ${identity.ean}`
        : "No canonical EAN configured.",
      `Matched EAN: ${product.ean || "unknown"}`,
      `Product match score: ${best.score}/100`,
      `isAvailable: ${String(product.isAvailable)}`,
      `availability.web: ${String(product.availability.web)}`,
      `availability.store: ${String(product.availability.store)}`,
    ],
  };
}

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

const PORT = Number(process.env.PORT || 8080);
const WORKER_SECRET = process.env.WORKER_SECRET || "";
const BASE_URL = "https://www.k-ruoka.fi";
const DATA_DIR = process.env.BROWSER_DATA_DIR || join(process.cwd(), ".browser-data");
const API_TIMEOUT_MS = 30_000;
const STORE_CACHE_MS = 15 * 60 * 1000;

let context: BrowserContext | null = null;
let page: Page | null = null;
let buildNumber: string | null = null;
let initialization: Promise<Page> | null = null;
let storesCache: { at: number; stores: KStore[] } | null = null;

type KStore = {
  id: string;
  name: string;
  chain?: string;
  chainName?: string;
  location?: unknown;
  isWebStore?: boolean;
};

type SearchProduct = {
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

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage) {
  if (!WORKER_SECRET) return false;
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${WORKER_SECRET}`;
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 64 * 1024) throw new Error("Request body too large.");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function browserLooksDead(error: unknown) {
  if (!(error instanceof Error)) return false;
  const text = error.message.toLowerCase();
  return (
    text.includes("target closed") ||
    text.includes("browser has been closed") ||
    text.includes("protocol error") ||
    text.includes("connection refused")
  );
}

async function launchBrowser() {
  mkdirSync(DATA_DIR, { recursive: true });
  const launchOptions = {
    headless: true,
    locale: "fi-FI",
    timezoneId: "Europe/Helsinki",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/142.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  } as const;

  try {
    context = await chromium.launchPersistentContext(DATA_DIR, launchOptions);
  } catch (error) {
    console.warn("Browser profile failed; resetting profile.", error);
    if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
    mkdirSync(DATA_DIR, { recursive: true });
    context = await chromium.launchPersistentContext(DATA_DIR, launchOptions);
  }
}

async function navigateToKRuoka(currentPage: Page) {
  const response = await currentPage.goto(`${BASE_URL}/kauppa`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await currentPage
    .waitForFunction(() => document.title !== "Just a moment...", undefined, {
      timeout: 20_000,
    })
    .catch(() => {
      throw new Error("K-Ruoka Cloudflare challenge did not clear.");
    });

  buildNumber = (await response?.headerValue("k-ruoka-build")) || null;

  if (!buildNumber) {
    buildNumber = await currentPage.evaluate(() => {
      for (const script of Array.from(document.querySelectorAll("script"))) {
        const match = script.textContent?.match(/"release":"(\d+)"/);
        if (match?.[1]) return match[1];
      }
      return null;
    });
  }
}

async function resetSession() {
  if (page && !page.isClosed()) await page.close().catch(() => undefined);
  page = null;
  if (context) await context.close().catch(() => undefined);
  context = null;
  buildNumber = null;
  storesCache = null;
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
}

async function initializePage(): Promise<Page> {
  if (!context) await launchBrowser();
  if (!context) throw new Error("Browser did not start.");

  if (!page || page.isClosed()) page = await context.newPage();
  if (!page.url().startsWith(BASE_URL)) await navigateToKRuoka(page);
  return page;
}

async function getPage() {
  if (initialization) return initialization;
  initialization = initializePage()
    .catch(async (error) => {
      if (!browserLooksDead(error)) throw error;
      await resetSession();
      return initializePage();
    })
    .finally(() => {
      initialization = null;
    });
  return initialization;
}

type EvalEnvelope = {
  status: number;
  body: string;
};

type BrowserRequestInit = {
  method?: string;
  headers?: Record<string, string>;
};

type BrowserRequestPayload = {
  path: string;
  init?: BrowserRequestInit;
  timeout: number;
};

async function sameOriginRequest(
  path: string,
  init?: BrowserRequestInit,
): Promise<EvalEnvelope> {
  const currentPage =
    await getPage();

  const result =
    await currentPage.evaluate(
      async ({
        path,
        init,
        timeout,
      }: BrowserRequestPayload) => {
        const controller =
          new AbortController();

        const timer =
          setTimeout(
            () =>
              controller.abort(),
            timeout,
          );

        try {
          const response =
            await fetch(
              path,
              {
                method:
                  init?.method ||
                  "GET",

                headers:
                  init?.headers,

                signal:
                  controller.signal,
              },
            );

          return {
            status:
              response.status,

            body:
              await response.text(),
          };
        } finally {
          clearTimeout(
            timer,
          );
        }
      },
      {
        path,
        init,
        timeout:
          API_TIMEOUT_MS,
      },
    );

  return result;
}

function parseEnvelope<T>(envelope: EvalEnvelope): T {
  if (envelope.status === 403 || envelope.body.includes("cf-challenge")) {
    throw Object.assign(new Error(`K-Ruoka blocked browser session with HTTP ${envelope.status}.`), {
      code: "KRUOKA_BLOCKED",
    });
  }
  if (envelope.status < 200 || envelope.status >= 300) {
    throw new Error(`K-Ruoka API returned HTTP ${envelope.status}.`);
  }
  try {
    return JSON.parse(envelope.body) as T;
  } catch {
    throw new Error("K-Ruoka returned an unreadable API response.");
  }
}

async function withCloudflareRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof Error) || (error as Error & { code?: string }).code !== "KRUOKA_BLOCKED") {
      throw error;
    }
    console.warn("K-Ruoka blocked the browser session; rebuilding session once.");
    await resetSession();
    await getPage();
    return operation();
  }
}

async function fetchStores(): Promise<KStore[]> {
  if (storesCache && Date.now() - storesCache.at < STORE_CACHE_MS) {
    return storesCache.stores;
  }

  const stores = await withCloudflareRetry(async () => {
    const envelope = await sameOriginRequest("/kr-api/stores");
    const raw = parseEnvelope<{ results?: unknown[] }>(envelope);
    const list = Array.isArray(raw.results) ? raw.results : [];

    return list
      .map((value): KStore | null => {
        if (!value || typeof value !== "object") return null;
        const item = value as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.name !== "string") return null;
        return {
          id: item.id,
          name: item.name,
          chain: typeof item.chain === "string" ? item.chain : undefined,
          chainName: typeof item.chainName === "string" ? item.chainName : undefined,
          location: item.location,
          isWebStore: typeof item.isWebStore === "boolean" ? item.isWebStore : undefined,
        };
      })
      .filter((item): item is KStore => Boolean(item))
      .filter((item) => item.isWebStore !== false);
  });

  storesCache = { at: Date.now(), stores };
  return stores;
}

function storeSearchText(store: KStore) {
  const location =
    typeof store.location === "string"
      ? store.location
      : store.location && typeof store.location === "object"
        ? Object.values(store.location as Record<string, unknown>)
            .filter((value): value is string => typeof value === "string")
            .join(" ")
        : "";
  return normalize(`${store.name} ${location}`);
}

async function resolveStore(storeName: string, storeId?: string) {
  const stores = await fetchStores();
  if (storeId) {
    const exactId = stores.find((store) => store.id === storeId);
    if (!exactId) throw new Error(`K-Ruoka store ID ${storeId} was not found.`);
    return exactId;
  }

  const wanted = normalize(storeName);
  const exact = stores.find((store) => normalize(store.name) === wanted);
  if (exact) return exact;

  const contains = stores
    .filter((store) => {
      const text = storeSearchText(store);
      return text.includes(wanted) || wanted.includes(normalize(store.name));
    })
    .sort((a, b) => storeSearchText(a).length - storeSearchText(b).length);

  if (contains[0]) return contains[0];

  const jumboFallback = stores.find((store) => {
    const text = storeSearchText(store);
    return wanted.includes("jumbo") && text.includes("citymarket") && text.includes("jumbo");
  });
  if (jumboFallback) return jumboFallback;

  throw new Error(`Could not resolve K-Ruoka store "${storeName}".`);
}

function boolOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseProduct(item: unknown, requestedStoreId: string): SearchProduct | null {
  if (!item || typeof item !== "object") return null;
  const wrapper = item as Record<string, unknown>;
  const raw = wrapper.product;
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const localizedName = p.localizedName;
  const name =
    localizedName && typeof localizedName === "object"
      ? stringOrNull((localizedName as Record<string, unknown>).finnish)
      : null;
  const ean = stringOrNull(p.ean) || stringOrNull(p.id);
  if (!name || !ean) return null;

  const availabilityRaw = p.availability;
  const availability = availabilityRaw && typeof availabilityRaw === "object"
    ? availabilityRaw as Record<string, unknown>
    : {};

  const storeRaw = p.store;
  const productStoreId =
    storeRaw && typeof storeRaw === "object"
      ? stringOrNull((storeRaw as Record<string, unknown>).id)
      : null;

  const mobileScan = p.mobilescan && typeof p.mobilescan === "object"
    ? p.mobilescan as Record<string, unknown>
    : {};
  const pricing = mobileScan.pricing && typeof mobileScan.pricing === "object"
    ? mobileScan.pricing as Record<string, unknown>
    : {};
  const normal = pricing.normal && typeof pricing.normal === "object"
    ? pricing.normal as Record<string, unknown>
    : {};

  const brandRaw = p.brand && typeof p.brand === "object"
    ? p.brand as Record<string, unknown>
    : {};
  const categoryRaw = p.category && typeof p.category === "object"
    ? p.category as Record<string, unknown>
    : {};
  const categoryLocalized = categoryRaw.localizedName && typeof categoryRaw.localizedName === "object"
    ? categoryRaw.localizedName as Record<string, unknown>
    : {};
  const attributes = p.productAttributes && typeof p.productAttributes === "object"
    ? p.productAttributes as Record<string, unknown>
    : {};
  const slug = stringOrNull(attributes.urlSlug);
  const images = Array.isArray(p.images) ? p.images : [];

  return {
    id: stringOrNull(wrapper.id) || ean,
    name,
    ean,
    price: numberOrNull(normal.price),
    brand: stringOrNull(brandRaw.name),
    category: stringOrNull(categoryLocalized.finnish),
    isAvailable: boolOrNull(p.isAvailable),
    availability: {
      store: boolOrNull(availability.store),
      web: boolOrNull(availability.web),
    },
    storeId: productStoreId || requestedStoreId,
    url: slug ? `${BASE_URL}/kauppa/tuote/${slug}` : null,
    imageUrl: stringOrNull(images[0]),
  };
}

async function searchProducts(query: string, storeId: string, limit: number) {
  return withCloudflareRetry(async () => {
    await getPage();
    const params = new URLSearchParams({
      offset: "0",
      language: "fi",
      storeId,
      limit: String(limit),
      discountFilter: "false",
      isTosTrOffer: "false",
    });

    const envelope = await sameOriginRequest(
      `/kr-api/v2/product-search/${encodeURIComponent(query)}?${params.toString()}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "x-k-build-number": buildNumber || "30227",
        },
      },
    );

    const raw = parseEnvelope<{ result?: unknown[]; error?: { message?: string } }>(envelope);
    if (raw.error?.message) throw new Error(`K-Ruoka API: ${raw.error.message}`);
    return (Array.isArray(raw.result) ? raw.result : [])
      .map((item) => parseProduct(item, storeId))
      .filter((item): item is SearchProduct => Boolean(item));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/" && req.method === "GET") {
    return json(res, 200, { ok: true, service: "PokeDexAlert K-Ruoka Worker" });
  }

  if (!authorized(req)) {
    return json(res, 401, { ok: false, error: "Unauthorized." });
  }

  if (url.pathname === "/health" && req.method === "GET") {
    try {
      const currentPage = await getPage();
      return json(res, 200, {
        ok: true,
        browserReady: true,
        page: currentPage.url(),
        buildNumber,
      });
    } catch (error) {
      return json(res, 503, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (url.pathname === "/stores" && req.method === "GET") {
    try {
      const q = normalize(url.searchParams.get("q") || "");
      const stores = await fetchStores();
      const filtered = q
        ? stores.filter((store) => storeSearchText(store).includes(q))
        : stores;
      return json(res, 200, { ok: true, stores: filtered.slice(0, 50) });
    } catch (error) {
      return json(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (url.pathname === "/search" && req.method === "POST") {
    try {
      const body = await readJsonBody(req) as Record<string, unknown>;
      const query = typeof body.query === "string" ? body.query.trim() : "";
      const storeName = typeof body.storeName === "string" ? body.storeName.trim() : "";
      const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
      const requestedLimit = typeof body.limit === "number" ? Math.floor(body.limit) : 20;
      const limit = Math.max(1, Math.min(50, requestedLimit));

      if (!query) return json(res, 400, { ok: false, error: "query is required." });
      if (!storeName && !storeId) {
        return json(res, 400, { ok: false, error: "storeName or storeId is required." });
      }

      const store = await resolveStore(storeName || storeId, storeId || undefined);
      const products = await searchProducts(query, store.id, limit);

      return json(res, 200, {
        ok: true,
        store: { id: store.id, name: store.name, location: store.location },
        query,
        products,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Search failed", error);
      return json(res, 502, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json(res, 404, { ok: false, error: "Not found." });
}

const server = createServer((req, res) => {
  void handle(req, res).catch((error) => {
    console.error("Unhandled request error", error);
    if (!res.headersSent) {
      json(res, 500, { ok: false, error: "Internal worker error." });
    } else {
      res.end();
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PokeDexAlert K-Ruoka worker listening on :${PORT}`);
});

async function shutdown() {
  server.close();
  if (page && !page.isClosed()) await page.close().catch(() => undefined);
  if (context) await context.close().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

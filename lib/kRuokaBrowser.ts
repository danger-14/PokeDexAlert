import chromium from "@sparticuz/chromium-min";
import puppeteer, {
  type Browser,
  type HTTPResponse,
  type Page,
} from "puppeteer-core";

import {
  productMatchScore,
  productSearchVariants,
  resolveProductIdentity,
} from "./productTerms";

import type {
  MonitoredStore,
  Product,
  ProductIdentity,
} from "./types";

const KRUOKA_BASE_URL = "https://www.k-ruoka.fi";
const KRUOKA_ENTRY_URL = `${KRUOKA_BASE_URL}/kauppa`;
const API_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 45_000;

let cachedExecutablePath: string | null = null;
let executablePathPromise: Promise<string> | null = null;

type BrowserFetchResult = {
  status: number;
  ok: boolean;
  body: string;
};

type BrowserFetchPayload = {
  path: string;
  method: string;
  headers: Record<string, string>;
  timeout: number;
};

type KRuokaStore = {
  id: string;
  name: string;
  shortName?: string;
  shortestName?: string;
  chain?: string;
  chainName?: string;
  locationText?: string;
  isWebStore?: boolean;
};

type KRuokaCandidate = {
  ean?: string;
  name: string;
  price?: number;
  isAvailable?: boolean;
  storeAvailable?: boolean;
  webAvailable?: boolean;
  storeId?: string;
  urlSlug?: string;
  rawId?: string;
};

type Session = {
  browser: Browser;
  page: Page;
  buildNumber: string;
};

class KRuokaBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KRuokaBlockedError";
  }
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  if (typeof value === "string") return clean(value);
  if (typeof value === "number") return String(value);
  return undefined;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function nestedRecord(
  value: unknown,
  ...path: string[]
): Record<string, unknown> | undefined {
  let current: unknown = value;

  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }

  return isRecord(current) ? current : undefined;
}

function nestedValue(value: unknown, ...path: string[]) {
  let current: unknown = value;

  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }

  return current;
}

function chromiumPackUrl() {
  const rawHost =
    process.env.VERCEL_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (!rawHost) {
    throw new Error(
      "K-Ruoka browser requires VERCEL_URL. Deploy PokeDexAlert on Vercel before running this check.",
    );
  }

  const host = rawHost.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return `https://${host}/chromium-pack.tar`;
}

async function getExecutablePath() {
  if (cachedExecutablePath) return cachedExecutablePath;

  if (!executablePathPromise) {
    executablePathPromise = chromium
      .executablePath(chromiumPackUrl())
      .then((path: string) => {
        cachedExecutablePath = path;
        return path;
      })
      .catch((error: unknown) => {
        executablePathPromise = null;
        throw error;
      });
  }

  return executablePathPromise;
}

async function configurePage(page: Page) {
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/141.0.0.0 Safari/537.36",
  );

  await page.setExtraHTTPHeaders({
    "accept-language": "fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7",
  });

  await page.emulateTimezone("Europe/Helsinki").catch(() => undefined);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["fi-FI", "fi", "en-US", "en"],
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    const currentWindow = window as Window & {
      chrome?: { runtime?: Record<string, never> };
    };

    if (!currentWindow.chrome) {
      Object.defineProperty(currentWindow, "chrome", {
        value: { runtime: {} },
        configurable: true,
      });
    }
  });
}

async function buildNumberFromPage(
  page: Page,
  response: HTTPResponse | null,
) {
  const headerBuild = response?.headers()["k-ruoka-build"];
  if (headerBuild) return headerBuild;

  const scriptBuild = await page.evaluate(() => {
    for (const script of Array.from(document.querySelectorAll("script"))) {
      const match = script.textContent?.match(/"release":"(\d+)"/);
      if (match?.[1]) return match[1];
    }

    return null;
  });

  // This value is only a last-resort fallback. The live page/header is preferred.
  return scriptBuild || "30227";
}

async function createSession(): Promise<Session> {
  const executablePath = await getExecutablePath();

  const browser = await puppeteer.launch({
    executablePath,
    args: [
      ...chromium.args,
      "--lang=fi-FI",
      "--disable-blink-features=AutomationControlled",
    ],
    headless: true,
    defaultViewport: {
      width: 1365,
      height: 768,
      deviceScaleFactor: 1,
    },
  });

  try {
    const page = await browser.newPage();
    await configurePage(page);

    const response = await page.goto(KRUOKA_ENTRY_URL, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });

    try {
      await page.waitForFunction(
        () => {
          const title = document.title.toLowerCase();
          const body = document.body?.innerText?.toLowerCase() || "";

          return (
            title !== "just a moment..." &&
            !body.includes("checking your browser") &&
            !body.includes("verify you are human")
          );
        },
        { timeout: 20_000 },
      );
    } catch {
      throw new KRuokaBlockedError(
        "K-Ruoka Cloudflare challenge did not clear inside the Vercel browser.",
      );
    }

    if (response && response.status() === 403) {
      throw new KRuokaBlockedError(
        "K-Ruoka returned HTTP 403 even after opening a real Chromium session.",
      );
    }

    const buildNumber = await buildNumberFromPage(page, response);

    return {
      browser,
      page,
      buildNumber,
    };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}

async function fetchInsidePage(
  page: Page,
  path: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
  },
): Promise<BrowserFetchResult> {
  const result = await page.evaluate(
    async ({
      path,
      method,
      headers,
      timeout,
    }: BrowserFetchPayload) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(path, {
          method,
          headers,
          credentials: "include",
          signal: controller.signal,
        });

        return {
          status: response.status,
          ok: response.ok,
          body: await response.text(),
        };
      } finally {
        clearTimeout(timer);
      }
    },
    {
      path,
      method: options?.method || "GET",
      headers: options?.headers || {},
      timeout: API_TIMEOUT_MS,
    },
  );

  if (
    result.status === 403 ||
    /cf-challenge|just a moment|verify you are human/i.test(result.body)
  ) {
    throw new KRuokaBlockedError(
      `K-Ruoka blocked the browser API request with HTTP ${result.status}.`,
    );
  }

  if (!result.ok) {
    throw new Error(
      `K-Ruoka API returned HTTP ${result.status}: ${result.body.slice(0, 180)}`,
    );
  }

  return result;
}

function parseJson(body: string, label: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

function locationText(value: unknown) {
  if (typeof value === "string") return clean(value);
  if (!isRecord(value)) return undefined;

  return clean(
    [
      stringValue(value.address),
      stringValue(value.city),
      stringValue(value.postalCode),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function parseStores(data: unknown): KRuokaStore[] {
  if (!isRecord(data)) return [];

  const rawResults = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data.stores)
      ? data.stores
      : [];

  const stores: KRuokaStore[] = [];

  for (const item of rawResults) {
    if (!isRecord(item)) continue;

    const id = stringValue(item.id);
    const name = stringValue(item.name);

    if (!id || !name) continue;

    stores.push({
      id,
      name,
      shortName: stringValue(item.shortName),
      shortestName: stringValue(item.shortestName),
      chain: stringValue(item.chain),
      chainName: stringValue(item.chainName),
      locationText: locationText(item.location),
      isWebStore: booleanValue(item.isWebStore),
    });
  }

  return stores;
}

function storeScore(store: KRuokaStore, targetName: string) {
  const requested = normalize(targetName);
  const allText = normalize(
    [
      store.name,
      store.shortName,
      store.shortestName,
      store.chain,
      store.chainName,
      store.locationText,
    ]
      .filter(Boolean)
      .join(" "),
  );

  let score = 0;

  if (normalize(store.name) === requested) score += 120;
  if (allText.includes(requested)) score += 90;

  const importantTokens = requested
    .split(" ")
    .filter((token) => !["k", "citymarket", "ruoka"].includes(token));

  for (const token of importantTokens) {
    if (allText.includes(token)) score += 25;
  }

  if (requested.includes("citymarket") && allText.includes("citymarket")) {
    score += 30;
  }

  if (requested.includes("jumbo")) {
    if (!allText.includes("jumbo")) return -1;
    score += 100;

    if (allText.includes("vantaa")) score += 25;
  }

  if (store.isWebStore === true) score += 10;

  return score;
}

function findStore(stores: KRuokaStore[], target: MonitoredStore) {
  const ranked = stores
    .map((store) => ({
      store,
      score: storeScore(store, target.name),
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < 50) {
    throw new Error(
      `Could not confidently resolve "${target.name}" in the K-Ruoka store list.`,
    );
  }

  return best.store;
}

function localizedFinnishName(value: unknown) {
  const localizedName = nestedRecord(value, "localizedName");

  return (
    stringValue(localizedName?.finnish) ||
    stringValue(localizedName?.fi) ||
    stringValue(nestedValue(value, "productAttributes", "labelName", "fi")) ||
    stringValue(nestedValue(value, "productAttributes", "marketingName", "fi")) ||
    ""
  );
}

function parseCandidate(item: unknown): KRuokaCandidate | null {
  if (!isRecord(item)) return null;

  const product = isRecord(item.product) ? item.product : item;

  const ean =
    stringValue(product.ean) ||
    stringValue(product.baseEan) ||
    stringValue(product.id) ||
    stringValue(item.id);

  const name =
    localizedFinnishName(product) ||
    localizedFinnishName(item) ||
    stringValue(product.name) ||
    stringValue(item.name) ||
    "";

  if (!name && !ean) return null;

  const availability = nestedRecord(product, "availability");
  const productStore = nestedRecord(product, "store");

  const discountPrice = numberValue(
    nestedValue(product, "mobilescan", "pricing", "discount", "price"),
  );

  const normalPrice = numberValue(
    nestedValue(product, "mobilescan", "pricing", "normal", "price"),
  );

  const batchPrice = numberValue(
    nestedValue(product, "mobilescan", "pricing", "batch", "price"),
  );

  return {
    ean,
    name: name || ean || "K-Ruoka product",
    price: discountPrice ?? normalPrice ?? batchPrice,
    isAvailable: booleanValue(product.isAvailable),
    storeAvailable: booleanValue(availability?.store),
    webAvailable: booleanValue(availability?.web),
    storeId: stringValue(productStore?.id),
    urlSlug: stringValue(
      nestedValue(product, "productAttributes", "urlSlug"),
    ),
    rawId: stringValue(item.id),
  };
}

function parseSearchCandidates(data: unknown) {
  if (!isRecord(data)) return [];

  const rawResults = Array.isArray(data.result)
    ? data.result
    : Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.products)
        ? data.products
        : [];

  return rawResults
    .map(parseCandidate)
    .filter((candidate): candidate is KRuokaCandidate => Boolean(candidate));
}

function euro(value?: number) {
  if (value === undefined) return undefined;
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function productUrl(candidate: KRuokaCandidate, fallback: string) {
  if (!candidate.urlSlug) return fallback;

  if (/^https?:\/\//i.test(candidate.urlSlug)) {
    return candidate.urlSlug;
  }

  const slug = candidate.urlSlug.replace(/^\/+/, "");

  return slug.startsWith("kauppa/")
    ? `${KRUOKA_BASE_URL}/${slug}`
    : `${KRUOKA_BASE_URL}/kauppa/tuote/${slug}`;
}

async function fetchStoreList(session: Session) {
  const response = await fetchInsidePage(session.page, "/kr-api/stores");
  const stores = parseStores(parseJson(response.body, "K-Ruoka store list"));

  if (stores.length === 0) {
    throw new Error("K-Ruoka returned an empty store list.");
  }

  return stores;
}

async function searchKProducts(
  session: Session,
  storeId: string,
  query: string,
) {
  const params = new URLSearchParams({
    offset: "0",
    language: "fi",
    storeId,
    limit: "40",
    discountFilter: "false",
    isTosTrOffer: "false",
  });

  const path =
    `/kr-api/v2/product-search/${encodeURIComponent(query)}?${params.toString()}`;

  const response = await fetchInsidePage(session.page, path, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-k-build-number": session.buildNumber,
    },
  });

  return parseSearchCandidates(parseJson(response.body, "K-Ruoka product search"));
}

async function resolveCandidate(
  session: Session,
  target: MonitoredStore,
  store: KRuokaStore,
  identity: ProductIdentity | null,
) {
  const wanted = target.product_name?.trim() || target.name;
  const variants = productSearchVariants(wanted, identity).slice(0, 10);
  const seen = new Map<string, KRuokaCandidate>();

  for (const query of variants) {
    const candidates = await searchKProducts(session, store.id, query);

    for (const candidate of candidates) {
      const key = candidate.ean || `${candidate.rawId || ""}:${candidate.name}`;
      if (!seen.has(key)) seen.set(key, candidate);

      if (identity?.ean && candidate.ean === identity.ean) {
        return {
          candidate,
          exactEan: true,
          query,
        };
      }
    }

    // If the product has a known EAN, never substitute another ETB.
    if (identity?.ean) continue;

    const best = candidates
      .map((candidate) => ({
        candidate,
        score: productMatchScore(candidate.name, wanted, identity),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (best && best.score >= 80) {
      return {
        candidate: best.candidate,
        exactEan: false,
        query,
      };
    }
  }

  if (!identity?.ean) {
    const best = [...seen.values()]
      .map((candidate) => ({
        candidate,
        score: productMatchScore(candidate.name, wanted, identity),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (best && best.score >= 80) {
      return {
        candidate: best.candidate,
        exactEan: false,
        query: "fallback candidate ranking",
      };
    }
  }

  return null;
}

async function scanOneWithSession(
  session: Session,
  target: MonitoredStore,
  stores: KRuokaStore[],
): Promise<Product> {
  const wanted = target.product_name?.trim() || target.name;
  const identity = resolveProductIdentity(wanted);
  const store = findStore(stores, target);
  const resolved = await resolveCandidate(session, target, store, identity);

  if (!resolved) {
    return {
      monitorId: target.id,
      identityKey: identity?.key,
      ean: identity?.ean,
      store: target.name,
      title: identity?.canonicalName || wanted,
      url: target.listing_url,
      sku: identity?.ean,
      statusText: `Product not found at ${store.name}`,
      state: "unknown",
      available: false,
      evidence: [
        `K-Ruoka store resolved to ${store.name} (${store.id}).`,
        identity?.ean
          ? `Searched for exact EAN ${identity.ean}.`
          : `Searched for ${wanted}.`,
        "No exact EAN or sufficiently strong product match was returned.",
      ],
    };
  }

  const { candidate, exactEan, query } = resolved;

  const channelAvailable =
    candidate.storeAvailable === true || candidate.webAvailable === true;

  const explicitlyUnavailable =
    candidate.isAvailable === false ||
    (candidate.storeAvailable === false && candidate.webAvailable === false);

  const available = candidate.isAvailable !== false && channelAvailable;

  const state = available
    ? "in_stock"
    : explicitlyUnavailable
      ? "out_of_stock"
      : "unknown";

  const channelText = available
    ? candidate.storeAvailable && candidate.webAvailable
      ? "Available in store and online"
      : candidate.storeAvailable
        ? "Available in store"
        : "Available online"
    : explicitlyUnavailable
      ? "Not available at selected store"
      : "Availability unclear";

  return {
    monitorId: target.id,
    identityKey: identity?.key,
    storeProductId: candidate.rawId || candidate.ean,
    ean: candidate.ean || identity?.ean,
    store: target.name,
    title: candidate.name,
    url: productUrl(candidate, target.listing_url),
    price: euro(candidate.price),
    sku: candidate.ean || identity?.ean,
    stockText: channelText,
    statusText: channelText,
    state,
    available,
    evidence: [
      "Checked through Chromium running inside the Vercel function.",
      `K-Ruoka store: ${store.name} (${store.id}).`,
      `Search query: ${query}.`,
      exactEan
        ? `Exact EAN match: ${candidate.ean}.`
        : `Matched title: ${candidate.name}.`,
      `isAvailable: ${String(candidate.isAvailable)}`,
      `availability.store: ${String(candidate.storeAvailable)}`,
      `availability.web: ${String(candidate.webAvailable)}`,
      ...(candidate.storeId
        ? [`Product response store ID: ${candidate.storeId}.`]
        : []),
    ],
  };
}

async function scanTargetsInFreshSession(targets: MonitoredStore[]) {
  const session = await createSession();

  try {
    const stores = await fetchStoreList(session);
    const products: Product[] = [];
    const errors: string[] = [];

    for (const target of targets) {
      try {
        products.push(await scanOneWithSession(session, target, stores));
      } catch (error) {
        errors.push(
          `${target.name} / ${target.product_name || target.listing_url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { products, errors };
  } finally {
    await session.browser.close().catch(() => undefined);
  }
}

export async function scanKRuokaTargets(targets: MonitoredStore[]) {
  if (targets.length === 0) {
    return {
      products: [] as Product[],
      errors: [] as string[],
    };
  }

  try {
    return await scanTargetsInFreshSession(targets);
  } catch (error) {
    if (error instanceof KRuokaBlockedError) {
      // A second clean browser session can recover when Cloudflare invalidates
      // the first cold-start session or cookies.
      try {
        return await scanTargetsInFreshSession(targets);
      } catch (retryError) {
        throw new Error(
          `K-Ruoka browser check failed after a clean-session retry: ${
            retryError instanceof Error
              ? retryError.message
              : String(retryError)
          }`,
        );
      }
    }

    throw error;
  }
}

export async function scanKRuokaTarget(target: MonitoredStore) {
  const result = await scanKRuokaTargets([target]);

  if (result.products[0]) return result.products[0];

  throw new Error(
    result.errors[0] || "K-Ruoka browser check did not return a product result.",
  );
}

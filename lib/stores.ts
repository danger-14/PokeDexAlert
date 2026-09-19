import * as cheerio from "cheerio";

import { loadMonitoredStores } from "./database";
import {
  scanKRuokaTarget,
  scanKRuokaTargets,
} from "./kRuokaBrowser";
import {
  detectProductType,
  productMatchScore,
  productSearchVariants,
  resolveProductIdentity,
} from "./productTerms";
import type {
  AvailabilityState,
  MonitoredStore,
  Product,
  ProductIdentity,
  ProductType,
} from "./types";

const PRISMA_POKEMON_CATEGORY_URL =
  "https://www.prisma.fi/tuotemerkit/pokemon-tcg/kategoria/1559/kerailykortit-ja-tuotteet";

const COMING_SOON =
  /(?:coming\s+soon|tulossa\s+pian|kommer\s+snart|bald\s+(?:verf[uü]gbar|erh[aä]ltlich)|bient[oô]t\s+disponible|snart\s+tilg[aæ]ngelig)/i;

const FULLY_BOOKED =
  /(?:fully\s+booked|full\s*booked|booked\s+up|fully\s+reserved|reservation\s+full|fullbokad|fullt\s+bokad|fuldt\s+booket|ausgebucht|t[aä]yteen\s+varattu|loppuun\s+varattu|varattu\s+t[aä]yteen|ennakkovaraus\s+t[aä]ynn[aä])/i;

const OUT_OF_STOCK =
  /(?:out\s+of\s+stock|sold\s+out|loppuunmyyty|loppu\s+varastosta|varasto\s+loppu|ei\s+varastossa|ei\s+saatavilla|tuote\s+ei\s+ole\s+saatavilla|slut\s+i\s+lager|udsolgt|ikke\s+p[aå]\s+lager|nicht\s+auf\s+lager|ausverkauft)/i;

const WATCH_ONLY =
  /(?:watch\s+(?:this\s+)?product|set\s+(?:a\s+)?watch|follow(?:\s+product)?|notify\s+me|notify\s+when\s+available|aseta\s+t[aä]lle\s+tuotteelle\s+vahti|tuotevahti|seuraa\s+tuotetta|bevaka(?:\s+produkt)?|overv[aå]g(?:\s+produkt)?)/i;

const PREORDER =
  /(?:pre[\s-]?order|preorder|pre[\s-]?sale|presale|ennakkotilaus|ennakkotilaa|ennakkotilattavissa|ennakkomyynti|f[oö]rbest[aä]ll|forudbestil|vorbestell|pr[eé]commande)/i;

const IN_STOCK =
  /(?:\bin\s+stock\b|\bavailable\s+now\b|\bvarastossa\b|\bvarastossa\s+heti\b|\bi\s+lager\b|\bp[aå]\s+lager\b|\bauf\s+lager\b)/i;

const BUY_ACTION =
  /(?:add\s+to\s+(?:cart|basket)|buy\s+now|order\s+now|place\s+order|lis[aä][aä]\s+(?:ostoskoriin|tilaukseen)|osta\s+nyt|\bosta\b|\btilaa\b|l[aä]gg\s+i\s+varukorg|k[oø]b\s+nu|l[aæ]g\s+i\s+kurv|in\s+den\s+warenkorb)/i;

const STOCK_SNIPPET =
  /(?:(?:saatavuus|availability|stock|lagerstatus|varasto)\s*:?\s*[^\n|]{0,100}|\b\d+\+?\s+(?:j[aä]ljell[aä]\s+varastossa|left\s+in\s+stock|remaining|kvar\s+i\s+lager|p[aå]\s+lager)\b)/i;

class HttpError extends Error {
  status: number;
  url: string;

  constructor(url: string, status: number) {
    super(`${url} returned HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hostOf(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isPrismaTarget(target: MonitoredStore) {
  return (
    hostOf(target.listing_url) === "prisma.fi" ||
    /^prisma\b/i.test(target.name.trim())
  );
}

function isKRuokaTarget(target: MonitoredStore) {
  const host = hostOf(target.listing_url);

  return (
    host === "k-ruoka.fi" ||
    /k[\s-]*citymarket|k[\s-]*ruoka/i.test(target.name)
  );
}

function browserHeaders() {
  return {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/153.0.0.0 Safari/537.36",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
  };
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: browserHeaders(),
  });

  if (!response.ok) {
    throw new HttpError(url, response.status);
  }

  return {
    html: await response.text(),
    finalUrl: response.url,
  };
}

function parseJsonLd($: cheerio.CheerioAPI) {
  const values: unknown[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;

    try {
      values.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD.
    }
  });

  return values;
}

function walkJson(
  value: unknown,
  visit: (record: Record<string, unknown>) => void,
) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit);
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  visit(record);

  for (const item of Object.values(record)) {
    walkJson(item, visit);
  }
}

function structuredSignals($: cheerio.CheerioAPI) {
  const availability: string[] = [];
  const skus: string[] = [];
  const prices: string[] = [];
  let hasProductSchema = false;

  for (const root of parseJsonLd($)) {
    walkJson(root, (record) => {
      const type = record["@type"];
      const types = Array.isArray(type) ? type : [type];

      if (
        types.some(
          (item) => String(item).toLowerCase() === "product",
        )
      ) {
        hasProductSchema = true;
      }

      if (typeof record.availability === "string") {
        availability.push(record.availability);
      }

      for (const key of [
        "sku",
        "gtin",
        "gtin12",
        "gtin13",
        "gtin14",
        "mpn",
        "productID",
        "productId",
      ]) {
        const item = record[key];

        if (
          (typeof item === "string" || typeof item === "number") &&
          clean(String(item))
        ) {
          skus.push(clean(String(item)));
        }
      }

      const price = record.price;

      if (typeof price === "string" || typeof price === "number") {
        const currency =
          typeof record.priceCurrency === "string"
            ? ` ${record.priceCurrency}`
            : "";

        prices.push(`${price}${currency}`);
      }
    });
  }

  return {
    availability: [...new Set(availability)],
    sku: [...new Set(skus)][0],
    price: prices[0],
    hasProductSchema,
  };
}

function getProductAreaText($: cheerio.CheerioAPI) {
  for (const selector of [
    "[itemtype*='Product']",
    "[data-product-id]",
    "[data-product]",
    ".product-page",
    ".product-detail",
    ".product-details",
    "main",
  ]) {
    const text = clean($(selector).first().text());
    if (text.length > 80) return text;
  }

  return clean($("body").text());
}

function isHiddenOrDisabled(
  $: cheerio.CheerioAPI,
  element: any,
) {
  const node = $(element);
  const classes = (node.attr("class") || "").toLowerCase();
  const style = (node.attr("style") || "").toLowerCase();

  return Boolean(
    node.attr("disabled") !== undefined ||
      node.attr("hidden") !== undefined ||
      node.attr("aria-disabled") === "true" ||
      node.attr("aria-hidden") === "true" ||
      /(?:^|\s)(?:disabled|is-disabled|unavailable)(?:\s|$)/.test(
        classes,
      ) ||
      /display\s*:\s*none|visibility\s*:\s*hidden/.test(style),
  );
}

function purchaseControls($: cheerio.CheerioAPI) {
  let activeBuy = false;
  let watch = false;
  const labels: string[] = [];

  $("button, a[href], input[type='submit'], input[type='button']").each(
    (_, element) => {
      const node = $(element);
      const label = clean(
        node.text() ||
          node.attr("value") ||
          node.attr("aria-label") ||
          node.attr("title") ||
          "",
      );

      if (!label) return;

      if (WATCH_ONLY.test(label)) {
        watch = true;
        labels.push(label);
      }

      if (BUY_ACTION.test(label) && !isHiddenOrDisabled($, element)) {
        activeBuy = true;
        labels.push(label);
      }
    },
  );

  return {
    activeBuy,
    watch,
    labels: [...new Set(labels)].slice(0, 10),
  };
}

function availabilityFromStructured(values: string[]) {
  const joined = values.join(" ").toLowerCase();

  if (/preorder|pre-order|presale|pre-sale/.test(joined)) {
    return "preorder" as const;
  }

  if (/instock|in-stock|limitedavailability/.test(joined)) {
    return "in_stock" as const;
  }

  if (/outofstock|out-of-stock|soldout|discontinued/.test(joined)) {
    return "out_of_stock" as const;
  }

  return undefined;
}

function classifyGenericPage(
  productText: string,
  structuredAvailability: string[],
  controls: ReturnType<typeof purchaseControls>,
) {
  const evidence: string[] = [];
  const structuredState = availabilityFromStructured(
    structuredAvailability,
  );

  if (FULLY_BOOKED.test(productText)) {
    return {
      state: "fully_booked" as const,
      available: false,
      evidence: ["Store says Fully booked"],
    };
  }

  if (COMING_SOON.test(productText)) {
    evidence.push("Store says Coming soon");

    if (controls.activeBuy) {
      evidence.push(
        "Purchase control ignored because Coming Soon takes priority",
      );
    }

    return {
      state: "coming_soon" as const,
      available: false,
      evidence,
    };
  }

  if (
    OUT_OF_STOCK.test(productText) ||
    structuredState === "out_of_stock"
  ) {
    return {
      state: "out_of_stock" as const,
      available: false,
      evidence: ["Store says Out of stock"],
    };
  }

  if (controls.watch && !controls.activeBuy) {
    return {
      state: "watch_only" as const,
      available: false,
      evidence: ["Only Watch / Follow / Notify control is available"],
    };
  }

  if (structuredState === "preorder") {
    return {
      state: "preorder" as const,
      available: true,
      evidence: ["Structured availability says PreOrder"],
    };
  }

  if (structuredState === "in_stock") {
    return {
      state: "in_stock" as const,
      available: true,
      evidence: ["Structured availability says InStock"],
    };
  }

  if (PREORDER.test(productText) && controls.activeBuy) {
    return {
      state: "preorder" as const,
      available: true,
      evidence: [
        "Preorder wording and active purchase control detected",
      ],
    };
  }

  if (controls.activeBuy) {
    return {
      state: "in_stock" as const,
      available: true,
      evidence: [
        "Active purchase control found with no blocking status",
      ],
    };
  }

  if (IN_STOCK.test(productText) && !controls.watch) {
    return {
      state: "in_stock" as const,
      available: true,
      evidence: ["Visible In Stock wording detected"],
    };
  }

  return {
    state: "unknown" as const,
    available: false,
    evidence: ["No trustworthy purchasable state detected"],
  };
}

function extractPrice(
  $: cheerio.CheerioAPI,
  structuredPrice?: string,
) {
  const visiblePrice = clean(
    $(
      [
        "[itemprop='price']",
        ".product-price",
        ".price",
        "[class*='product'][class*='price']",
        "[data-testid*='price']",
      ].join(", "),
    )
      .first()
      .text(),
  );

  const metaPrice =
    $("meta[property='product:price:amount']").attr("content") ||
    $("meta[itemprop='price']").attr("content");

  return visiblePrice || metaPrice || structuredPrice || undefined;
}

function extractSku(
  $: cheerio.CheerioAPI,
  html: string,
  structuredSku?: string,
) {
  if (structuredSku) return structuredSku;

  const dataSku = $("[data-sku]").first().attr("data-sku");
  if (dataSku) return clean(dataSku);

  const textSku = clean(
    $("[itemprop='sku'], .sku, [class*='sku']").first().text(),
  );

  if (textSku) return textSku;

  const match = html.match(
    /["'](?:sku|productSku|manufacturerSku|articleNumber|productCode)["']\s*:\s*["']([^"']{2,80})["']/i,
  );

  return match?.[1] ? clean(match[1]) : undefined;
}

function extractStockText(productText: string) {
  const match = productText.match(STOCK_SNIPPET);
  return match?.[0] ? clean(match[0]) : undefined;
}

function extractVisibleStatus(productText: string) {
  for (const pattern of [
    FULLY_BOOKED,
    COMING_SOON,
    OUT_OF_STOCK,
    WATCH_ONLY,
    PREORDER,
    IN_STOCK,
  ]) {
    const match = productText.match(pattern);
    if (match?.[0]) return clean(match[0]);
  }

  return undefined;
}

function candidateLinks(
  html: string,
  baseUrl: string,
  wanted: string,
  identity: ProductIdentity | null,
  options?: {
    productPath?: string;
    allowedHost?: string;
    minimumScore?: number;
  },
) {
  const $ = cheerio.load(html);
  const candidates = new Map<
    string,
    { title: string; score: number }
  >();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const title = clean(
      $(element).text() ||
        $(element).attr("aria-label") ||
        $(element).attr("title") ||
        "",
    );

    try {
      const url = new URL(href, baseUrl);

      if (
        options?.allowedHost &&
        url.hostname.replace(/^www\./, "") !==
          options.allowedHost.replace(/^www\./, "")
      ) {
        return;
      }

      if (
        options?.productPath &&
        !url.pathname.includes(options.productPath)
      ) {
        return;
      }

      url.hash = "";

      const score = productMatchScore(title, wanted, identity);
      const minimumScore = options?.minimumScore ?? 45;

      if (score < minimumScore) return;

      const key = url.toString();
      const existing = candidates.get(key);

      if (!existing || score > existing.score) {
        candidates.set(key, { title, score });
      }
    } catch {
      // Ignore malformed URLs.
    }
  });

  return [...candidates.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 12);
}

async function inspectGenericProduct(
  target: MonitoredStore,
  url: string,
  wanted: string,
  identity: ProductIdentity | null,
  fallbackTitle?: string,
): Promise<Product> {
  const { html, finalUrl } = await fetchPage(url);
  const $ = cheerio.load(html);
  const structured = structuredSignals($);
  const productText = getProductAreaText($);
  const controls = purchaseControls($);
  const classification = classifyGenericPage(
    productText,
    structured.availability,
    controls,
  );

  const title =
    clean($("h1").first().text()) ||
    clean($("meta[property='og:title']").attr("content") || "") ||
    fallbackTitle ||
    wanted;

  const sku = extractSku($, html, structured.sku);

  return {
    monitorId: target.id,
    identityKey: identity?.key,
    ean:
      identity?.ean && sku === identity.ean
        ? identity.ean
        : undefined,
    store: target.name,
    title,
    url: finalUrl,
    price: extractPrice($, structured.price),
    sku,
    stockText: extractStockText(productText),
    statusText: extractVisibleStatus(productText),
    state: classification.state,
    available: classification.available,
    evidence: [
      ...classification.evidence,
      ...(identity?.ean ? [`Expected EAN: ${identity.ean}`] : []),
      ...(sku ? [`Detected SKU/EAN: ${sku}`] : []),
    ],
  };
}

async function scanGenericTarget(
  target: MonitoredStore,
  identity: ProductIdentity | null,
): Promise<Product> {
  const wanted = target.product_name?.trim() || target.name;
  const { html, finalUrl } = await fetchPage(target.listing_url);
  const $ = cheerio.load(html);
  const structured = structuredSignals($);

  const h1 = clean($("h1").first().text());
  const directScore = productMatchScore(h1, wanted, identity);

  if (structured.hasProductSchema || directScore >= 70) {
    const product = await inspectGenericProduct(
      target,
      finalUrl,
      wanted,
      identity,
    );

    if (
      !identity?.ean ||
      product.sku === identity.ean ||
      productMatchScore(product.title, wanted, identity) >= 70
    ) {
      return product;
    }
  }

  const candidates = candidateLinks(
    html,
    finalUrl,
    wanted,
    identity,
    {
      allowedHost: new URL(finalUrl).hostname,
    },
  );

  for (const [url, candidate] of candidates) {
    try {
      const product = await inspectGenericProduct(
        target,
        url,
        wanted,
        identity,
        candidate.title,
      );

      if (identity?.ean && product.sku === identity.ean) {
        product.evidence.unshift("Exact EAN match.");
        return product;
      }

      if (productMatchScore(product.title, wanted, identity) >= 70) {
        return product;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return {
    monitorId: target.id,
    identityKey: identity?.key,
    ean: identity?.ean,
    store: target.name,
    title: identity?.canonicalName || wanted,
    url: target.listing_url,
    sku: identity?.ean,
    statusText: "Product not found",
    state: "unknown",
    available: false,
    evidence: [
      identity?.ean
        ? `Expected EAN: ${identity.ean}`
        : "No canonical EAN is configured for this product.",
      "No confident product match was found on the source page.",
    ],
  };
}

/* =====================================================
   PRISMA
   ===================================================== */

function prismaProductId(url: string) {
  try {
    return new URL(url).pathname.match(/\/tuotteet\/(\d+)/)?.[1];
  } catch {
    return undefined;
  }
}

function extractPrismaEan(text: string, html: string) {
  const fromText = text.match(
    /Tuotekoodi\s*([0-9]{12,14})/i,
  )?.[1];

  if (fromText) return fromText;

  return html.match(
    /(?:gtin|ean|productCode|sku)["']?\s*[:=]\s*["']?([0-9]{12,14})/i,
  )?.[1];
}

function prismaTypeSearchTerm(type: ProductType) {
  switch (type) {
    case "etb":
      return "Elite Trainer";
    case "upc":
      return "Ultra Premium Collection";
    case "booster_box":
      return "Booster Box";
    case "booster_bundle":
      return "Booster Bundle";
    case "binder":
      return "Binder";
    case "poster":
      return "Poster";
    case "blister":
      return "Blister";
    case "tin":
      return "Tin";
    default:
      return "Pokemon";
  }
}

type PrismaProduct = Product & {
  matchScore: number;
};

async function inspectPrismaProduct(
  target: MonitoredStore,
  url: string,
  wanted: string,
  identity: ProductIdentity | null,
): Promise<PrismaProduct> {
  const { html, finalUrl } = await fetchPage(url);
  const $ = cheerio.load(html);
  const bodyText = clean($("body").text());
  const title =
    clean($("h1").first().text()) ||
    clean($("meta[property='og:title']").attr("content") || "") ||
    wanted;

  const ean = extractPrismaEan(bodyText, html);
  const id = prismaProductId(finalUrl);

  let matchScore = productMatchScore(title, wanted, identity);

  if (identity?.ean && ean === identity.ean) {
    matchScore = 100;
  } else if (identity?.ean && ean && ean !== identity.ean) {
    matchScore = 0;
  }

  const onlineAvailable =
    /Toimitus\s+Kotiin\s+tai\s+noutopisteeseen/i.test(bodyText);

  const pickupSelectable =
    /Nouto\s+myym[aä]l[aä]st[aä]\s+Ilmainen\s+Siirry\s+valitsemaan\s+myym[aä]l[aä]/i.test(
      bodyText,
    );

  const onlineUnavailable =
    /Toimitus\s+Ei\s+saatavilla/i.test(bodyText);

  const pickupUnavailable =
    /Nouto\s+myym[aä]l[aä]st[aä]\s+Ei\s+saatavilla/i.test(bodyText);

  const preorder = PREORDER.test(bodyText);

  let state: AvailabilityState = "unknown";
  let available = false;
  let statusText = "Availability unclear";

  if (preorder && (onlineAvailable || pickupSelectable)) {
    state = "preorder";
    available = true;
    statusText = "Preorder available";
  } else if (onlineAvailable || pickupSelectable) {
    state = "in_stock";
    available = true;
    statusText = onlineAvailable
      ? "Available from Prisma"
      : "Store pickup selectable";
  } else if (onlineUnavailable && pickupUnavailable) {
    state = "out_of_stock";
    available = false;
    statusText = "Not available";
  }

  const price = bodyText.match(/\b(\d{1,4}[,.]\d{2})\s*€/i)?.[1];

  return {
    monitorId: target.id,
    identityKey: identity?.key,
    storeProductId: id,
    ean: ean || identity?.ean,
    store: target.name,
    title,
    url: finalUrl,
    price: price ? `${price.replace(".", ",")} €` : undefined,
    sku: ean || identity?.ean,
    statusText,
    stockText: statusText,
    state,
    available,
    matchScore,
    evidence: [
      id ? `Prisma product ID: ${id}` : "Prisma product ID not detected.",
      identity?.ean
        ? `Expected EAN: ${identity.ean}`
        : "No canonical EAN configured.",
      ean ? `Prisma Tuotekoodi/EAN: ${ean}` : "EAN not detected on page.",
      `Match score: ${matchScore}/100`,
      `Online delivery available: ${String(onlineAvailable)}`,
      `Pickup selectable: ${String(pickupSelectable)}`,
    ],
  };
}

function collectPrismaLinks(
  html: string,
  baseUrl: string,
  wanted: string,
  identity: ProductIdentity | null,
) {
  const $ = cheerio.load(html);
  const wantedType = identity?.productType || detectProductType(wanted);

  const links = new Map<
    string,
    { title: string; priority: number }
  >();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    try {
      const url = new URL(href, baseUrl);

      if (
        url.hostname.replace(/^www\./, "") !== "prisma.fi" ||
        !url.pathname.includes("/tuotteet/")
      ) {
        return;
      }

      url.search = "";
      url.hash = "";

      const title = clean(
        $(element).text() ||
          $(element).attr("aria-label") ||
          $(element).attr("title") ||
          "",
      );

      const candidateType = detectProductType(title);
      const score = productMatchScore(title, wanted, identity);

      let priority = score;

      if (wantedType && candidateType === wantedType) priority += 30;

      if (
        identity?.setCode &&
        title.toUpperCase().includes(identity.setCode.toUpperCase())
      ) {
        priority += 40;
      }

      if (wantedType && candidateType && candidateType !== wantedType) {
        return;
      }

      if (wantedType === "etb" && /elite\s+trainer/i.test(title)) {
        priority += 20;
      }

      const key = url.toString();
      const existing = links.get(key);

      if (!existing || priority > existing.priority) {
        links.set(key, { title, priority });
      }
    } catch {
      // Ignore malformed URLs.
    }
  });

  return [...links.entries()]
    .sort((a, b) => b[1].priority - a[1].priority)
    .slice(0, 12);
}

async function scanPrismaTarget(
  target: MonitoredStore,
  identity: ProductIdentity | null,
): Promise<Product> {
  const wanted = target.product_name?.trim() || target.name;

  const directUrls = new Set<string>();

  if (target.listing_url.includes("/tuotteet/")) {
    directUrls.add(target.listing_url);
  }

  const knownPrismaUrl = identity?.storeRefs?.prisma?.productUrl;
  if (knownPrismaUrl) directUrls.add(knownPrismaUrl);

  for (const url of directUrls) {
    try {
      const product = await inspectPrismaProduct(
        target,
        url,
        wanted,
        identity,
      );

      if (
        (identity?.ean && product.ean === identity.ean) ||
        product.matchScore >= 80
      ) {
        return product;
      }
    } catch {
      // Continue to discovery.
    }
  }

  const discoveryUrls = new Set<string>();

  for (const query of productSearchVariants(wanted, identity)) {
    discoveryUrls.add(
      `https://www.prisma.fi/haku?q=${encodeURIComponent(query)}`,
    );
  }

  if (target.listing_url && !target.listing_url.includes("/tuotteet/")) {
    discoveryUrls.add(target.listing_url);
  }

  discoveryUrls.add(PRISMA_POKEMON_CATEGORY_URL);

  const candidateMap = new Map<
    string,
    { title: string; priority: number }
  >();

  for (const discoveryUrl of discoveryUrls) {
    try {
      const { html, finalUrl } = await fetchPage(discoveryUrl);

      for (const [url, candidate] of collectPrismaLinks(
        html,
        finalUrl,
        wanted,
        identity,
      )) {
        const existing = candidateMap.get(url);

        if (!existing || candidate.priority > existing.priority) {
          candidateMap.set(url, candidate);
        }
      }

      if (candidateMap.size >= 12) break;
    } catch {
      // One discovery URL failing should not stop the other fallbacks.
    }
  }

  const candidates = [...candidateMap.entries()]
    .sort((a, b) => b[1].priority - a[1].priority)
    .slice(0, 10);

  const inspected = await Promise.allSettled(
    candidates.map(([url]) =>
      inspectPrismaProduct(target, url, wanted, identity),
    ),
  );

  const products = inspected
    .filter(
      (result): result is PromiseFulfilledResult<PrismaProduct> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);

  if (identity?.ean) {
    const exact = products.find((product) => product.ean === identity.ean);
    if (exact) {
      exact.evidence.unshift("Exact Prisma EAN match.");
      return exact;
    }
  }

  const best = products.sort(
    (a, b) => b.matchScore - a.matchScore,
  )[0];

  if (best && best.matchScore >= 80) return best;

  return {
    monitorId: target.id,
    identityKey: identity?.key,
    ean: identity?.ean,
    store: target.name,
    title: identity?.canonicalName || wanted,
    url: target.listing_url || PRISMA_POKEMON_CATEGORY_URL,
    sku: identity?.ean,
    statusText: "Product not found on Prisma",
    state: "unknown",
    available: false,
    evidence: [
      identity?.ean
        ? `Prisma was searched for EAN ${identity.ean}.`
        : `Prisma was searched for "${wanted}".`,
      identity?.setCode
        ? `Set code: ${identity.setCode}.`
        : "No set code configured.",
      `Product type: ${
        identity?.productType || detectProductType(wanted) || "unknown"
      }.`,
      "No exact EAN or sufficiently strong product match was found.",
    ],
  };
}

/* =====================================================
   EXPORTED ROUTER
   ===================================================== */

export async function scanTarget(target: MonitoredStore): Promise<Product> {
  const wanted = target.product_name?.trim() || target.name;
  const identity = resolveProductIdentity(wanted);

  if (isKRuokaTarget(target)) {
    return scanKRuokaTarget(target);
  }

  if (isPrismaTarget(target)) {
    return scanPrismaTarget(target, identity);
  }

  return scanGenericTarget(target, identity);
}

export async function scanStores() {
  const products: Product[] = [];
  const errors: string[] = [];

  let targets: MonitoredStore[] = [];

  try {
    targets = await loadMonitoredStores();
  } catch (error) {
    return {
      products,
      errors: [`Could not load monitors: ${String(error)}`],
    };
  }

  const kRuokaTargets = targets.filter(isKRuokaTarget);
  const normalTargets = targets.filter((target) => !isKRuokaTarget(target));

  // Keep ordinary HTTP-based stores fast and lightweight.
  const batchSize = 4;

  for (let index = 0; index < normalTargets.length; index += batchSize) {
    const batch = normalTargets.slice(index, index + batchSize);
    const results = await Promise.allSettled(batch.map(scanTarget));

    results.forEach((result, batchIndex) => {
      const target = batch[batchIndex];

      if (result.status === "fulfilled") {
        products.push(result.value);
      } else {
        errors.push(
          `${target.name} / ${
            target.product_name || target.listing_url
          }: ${
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          }`,
        );
      }
    });
  }

  // K-Ruoka targets deliberately share one Chromium session. This avoids
  // launching one browser per product during the cron job.
  if (kRuokaTargets.length > 0) {
    try {
      const kRuokaResult = await scanKRuokaTargets(kRuokaTargets);
      products.push(...kRuokaResult.products);
      errors.push(...kRuokaResult.errors);
    } catch (error) {
      errors.push(
        `K-Ruoka browser session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { products, errors };
}

export const filterDescription =
  "EAN-first Pokémon product matching. Prisma uses exact Tuotekoodi/EAN when known; K-Ruoka uses a store-scoped Chromium session inside Vercel; other stores use the generic availability scanner.";

export const stateLabel: Record<AvailabilityState, string> = {
  in_stock: "In stock",
  preorder: "Preorder",
  coming_soon: "Coming soon",
  fully_booked: "Fully booked",
  out_of_stock: "Out of stock",
  watch_only: "Unavailable",
  unknown: "Unknown",
};

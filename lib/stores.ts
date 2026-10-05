import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "./http";
import {
  discoverLinks,
  parseGenericProductPage,
  compactText,
  extractLimit,
  extractPrice,
} from "./scrapeUtils";
import { isWanted30thProduct } from "./productTerms";
import type {
  ProductHit,
  StoreKey,
  StoreScanResult,
} from "./types";

type StoreConfig = {
  key: StoreKey;
  name: string;
  discoveryUrls: string[];
};

const PRISMA_MIN_STORE_QUANTITY = 20;

const configs: StoreConfig[] = [
  {
    key: "pokepulls",
    name: "PokePulls",
    discoveryUrls: [
      "https://pokepulls.fi/",
    ],
  },

  {
    key: "tcgkauppa",
    name: "TCG Kauppa",
    discoveryUrls: [
      "https://www.tcgkauppa.fi/",
      "https://www.tcgkauppa.fi/pokemon-30th-celebration/",
      "https://www.tcgkauppa.fi/ennakkotilaukset/",
    ],
  },

  {
    key: "swagykarp",
    name: "SwagyKarp",
    discoveryUrls: [
      "https://swagykarp.fi/",
      "https://swagykarp.fi/product-category/pokemon-expansions/30th-celebration/",
      "https://swagykarp.fi/product-category/pokemon-expansions/",
    ],
  },

  {
    key: "prisma",
    name: "Prisma",
    discoveryUrls: [
      "https://www.prisma.fi/tuotemerkit/pokemon/kategoria/1559/kerailykortit-ja-tuotteet",
      "https://www.prisma.fi/tuotemerkit/pokemon-tcg/kategoria/1559/kerailykortit-ja-tuotteet",
    ],
  },
];

async function discover(config: StoreConfig) {
  const links = new Map<string, string>();
  const errors: string[] = [];

  for (const url of config.discoveryUrls) {
    try {
      const html = await fetchText(url);

      for (const item of discoverLinks(html, url)) {
        links.set(item.url, item.name);
      }
    } catch (e) {
      errors.push(
        `${url}: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  return {
    items: [...links.entries()].map(([url, name]) => ({
      url,
      name,
    })),
    errors,
  };
}

/* ============================================================
   SWAGYKARP
   ============================================================ */

type SwagyStockResult = {
  status: "available" | "out_of_stock" | "unknown";
  stockText?: string;
};

function parseSwagyStock(
  html: string
): SwagyStockResult {
  const $ = cheerio.load(html);

  /*
   * 1. WooCommerce stock elements
   */
  const outOfStockElement =
    $(".stock.out-of-stock").first();

  if (outOfStockElement.length > 0) {
    return {
      status: "out_of_stock",
      stockText: compactText(
        outOfStockElement.text()
      ),
    };
  }

  const inStockElement =
    $(".stock.in-stock").first();

  if (inStockElement.length > 0) {
    const text = compactText(
      inStockElement.text()
    );

    /*
     * Protect against strings like:
     * "0 in stock"
     */
    const qtyMatch =
      text.match(
        /(\d+)\s*(?:in stock|varastossa)/i
      );

    if (qtyMatch) {
      const qty = Number(qtyMatch[1]);

      return {
        status:
          qty > 0
            ? "available"
            : "out_of_stock",
        stockText: text,
      };
    }

    return {
      status: "available",
      stockText: text,
    };
  }

  /*
   * 2. Generic WooCommerce availability block
   */
  const availabilityText =
    compactText(
      $(
        ".woocommerce-variation-availability, .summary .stock, .product .stock"
      )
        .first()
        .text()
    );

  if (availabilityText) {
    if (
      /out of stock|varasto loppu|loppu varastosta|ei varastossa|0\s*(?:in stock|varastossa)/i.test(
        availabilityText
      )
    ) {
      return {
        status: "out_of_stock",
        stockText: availabilityText,
      };
    }

    const qtyMatch =
      availabilityText.match(
        /(\d+)\s*(?:in stock|varastossa)/i
      );

    if (qtyMatch) {
      const qty = Number(qtyMatch[1]);

      return {
        status:
          qty > 0
            ? "available"
            : "out_of_stock",
        stockText: availabilityText,
      };
    }

    if (
      /in stock|varastossa|saatavilla/i.test(
        availabilityText
      )
    ) {
      return {
        status: "available",
        stockText: availabilityText,
      };
    }
  }

  /*
   * 3. Schema.org / JSON-LD availability
   */
  let schemaAvailable = false;
  let schemaOutOfStock = false;

  $("script[type='application/ld+json']").each(
    (_, el) => {
      const raw = $(el).html();

      if (!raw) return;

      const text = raw.toLowerCase();

      if (
        text.includes(
          "schema.org/outofstock"
        ) ||
        text.includes(
          '"availability":"outofstock"'
        )
      ) {
        schemaOutOfStock = true;
      }

      if (
        text.includes(
          "schema.org/instock"
        ) ||
        text.includes(
          '"availability":"instock"'
        )
      ) {
        schemaAvailable = true;
      }
    }
  );

  if (schemaOutOfStock) {
    return {
      status: "out_of_stock",
      stockText: "WooCommerce schema: OutOfStock",
    };
  }

  if (schemaAvailable) {
    return {
      status: "available",
      stockText: "WooCommerce schema: InStock",
    };
  }

  /*
   * 4. Page-text fallback
   */
  const body =
    compactText(
      $("body").text()
    );

  if (
    /out of stock|varasto loppu|loppu varastosta|ei varastossa/i.test(
      body
    )
  ) {
    return {
      status: "out_of_stock",
      stockText: "Page indicates out of stock",
    };
  }

  /*
   * Important:
   * We deliberately DO NOT use the Add to Cart
   * button as proof of stock anymore.
   */
  return {
    status: "unknown",
    stockText:
      "No reliable WooCommerce stock signal found",
  };
}

/* ============================================================
   PRISMA
   ============================================================ */

function prismaProductId(url: string) {
  const matches = [
    ...url.matchAll(/(\d{9})/g),
  ];

  return matches.at(-1)?.[1];
}

type PrismaAvailability = unknown;

function findRawShelfQuantity(
  value: unknown
): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found =
        findRawShelfQuantity(item);

      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (
        key === "rawShelfQuantity" &&
        typeof child === "number"
      ) {
        return child;
      }

      const found =
        findRawShelfQuantity(child);

      if (found !== undefined) {
        return found;
      }
    }
  }

  return undefined;
}

async function prismaStoresToCheck() {
  const configured = (
    process.env.PRISMA_STORES ||
    "Jumbo,Kerava,Tuusula"
  ).trim();

  return configured
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function mapWithConcurrency<
  T,
  R
>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results =
    new Array<R>(items.length);

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) {
        return;
      }

      results[index] =
        await fn(items[index]);
    }
  }

  const workerCount =
    Math.max(
      1,
      Math.min(limit, items.length)
    );

  await Promise.all(
    Array.from(
      {
        length: workerCount,
      },
      () => worker()
    )
  );

  return results;
}

async function enrichPrisma(
  hit: ProductHit
): Promise<ProductHit> {
  const id =
    prismaProductId(hit.url);

  if (!id) {
    return hit;
  }

  const onlineAvailable =
    hit.status === "available";

  const stores =
    await prismaStoresToCheck();

  const checks =
    await mapWithConcurrency(
      stores,
      3,
      async (store) => {
        const endpoint =
          `https://storefront-api.prisma.fi/products/${id}/availability` +
          `?category=elektroniikka%2Fgaming%2Fkerailykortit-ja-tuotteet` +
          `&nodeSearch=${encodeURIComponent(
            store
          )}`;

        try {
          const json =
            await fetchJson<PrismaAvailability>(
              endpoint,
              12000
            );

          const qty =
            findRawShelfQuantity(json);

          const storeAvailable =
            typeof qty === "number" &&
            qty >=
              PRISMA_MIN_STORE_QUANTITY;

          return {
            store,
            qty,
            available:
              storeAvailable,
            detail:
              `${store}: rawShelfQuantity=${
                qty ?? "unknown"
              }${
                storeAvailable
                  ? " (ALERT)"
                  : ""
              }`,
          };
        } catch (e) {
          return {
            store,
            qty: undefined,
            available: false,
            detail:
              `${store}: API error (${
                e instanceof Error
                  ? e.message
                  : String(e)
              })`,
          };
        }
      }
    );

  const availableStores =
    checks
      .filter(
        (x) => x.available
      )
      .map(
        (x) => x.store
      );

  const shouldAlert =
    onlineAvailable ||
    availableStores.length > 0;

  const storeDetails =
    checks.map(
      (x) => x.detail
    );

  const locationParts:
    string[] = [];

  if (onlineAvailable) {
    locationParts.push(
      "Prisma online: AVAILABLE"
    );
  }

  if (
    availableStores.length > 0
  ) {
    locationParts.push(
      `Store stock >= ${PRISMA_MIN_STORE_QUANTITY}: ${availableStores.join(
        ", "
      )}`
    );
  }

  if (
    locationParts.length === 0
  ) {
    locationParts.push(
      `No monitored Prisma store has rawShelfQuantity >= ${PRISMA_MIN_STORE_QUANTITY}`
    );
  }

  return {
    ...hit,

    status:
      shouldAlert
        ? "available"
        : "out_of_stock",

    location:
      locationParts.join(
        " | "
      ),

    availabilityText: [
      hit.availabilityText,

      `Online available: ${
        onlineAvailable
          ? "YES"
          : "NO"
      }`,

      ...storeDetails,
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

/* ============================================================
   STORE SCANNER
   ============================================================ */

async function scanStore(
  config: StoreConfig
): Promise<StoreScanResult> {
  try {
    const {
      items,
      errors,
    } =
      await discover(config);

    const products:
      ProductHit[] = [];

    for (const item of items) {
      if (
        !isWanted30thProduct(
          item.name
        )
      ) {
        continue;
      }

      try {
        const html =
          await fetchText(
            item.url
          );

        let hit =
          parseGenericProductPage({
            html,
            url: item.url,
            fallbackName:
              item.name,
            store:
              config.key,
            storeName:
              config.name,
          });

        /*
         * SWAGYKARP
         *
         * Do NOT trust an enabled
         * Add to Cart button alone.
         *
         * WooCommerce stock status
         * is the source of truth.
         */
        if (
          config.key ===
          "swagykarp"
        ) {
          const $ =
            cheerio.load(
              html
            );

          const body =
            compactText(
              $("body").text()
            );

          const stock =
            parseSwagyStock(
              html
            );

          hit = {
            ...hit,

            status:
              stock.status,

            availabilityText: [
              hit.availabilityText,
              `SwagyKarp stock: ${
                stock.stockText ||
                stock.status
              }`,
            ]
              .filter(Boolean)
              .join(" | "),

            price:
              hit.price ||
              extractPrice(
                body
              ),

            purchaseLimit:
              hit.purchaseLimit ||
              extractLimit(
                body
              ),
          };
        }

        /*
         * PRISMA
         */
        if (
          config.key ===
          "prisma"
        ) {
          hit =
            await enrichPrisma(
              hit
            );
        }

        products.push(hit);
      } catch (e) {
        products.push({
          id:
            `${config.key}:${item.url}`,

          store:
            config.key,

          storeName:
            config.name,

          name:
            item.name,

          url:
            item.url,

          status:
            "unknown",

          availabilityText:
            e instanceof Error
              ? e.message
              : String(e),
        });
      }
    }

    return {
      store:
        config.key,

      storeName:
        config.name,

      ok:
        errors.length <
        config.discoveryUrls.length,

      products,

      error:
        errors.length
          ? errors.join(
              " ; "
            )
          : undefined,
    };
  } catch (e) {
    return {
      store:
        config.key,

      storeName:
        config.name,

      ok: false,

      products: [],

      error:
        e instanceof Error
          ? e.message
          : String(e),
    };
  }
}

export async function scanAllStores() {
  return Promise.all(
    configs.map(
      scanStore
    )
  );
}

export function storeSummary() {
  return configs.map(
    (x) => ({
      key: x.key,
      name: x.name,
      discoveryUrls:
        x.discoveryUrls,
    })
  );
}

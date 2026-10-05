import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "./http";
import {
  discoverLinks,
  parseGenericProductPage,
  compactText,
  extractLimit,
  extractPrice,
  statusFromText,
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
      "https://swagykarp.fi/collections/all",
      "https://swagykarp.fi/collections/pokemon",
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

function prismaProductId(url: string) {
  const matches = [...url.matchAll(/(\d{9})/g)];

  return matches.at(-1)?.[1];
}

type PrismaAvailability = unknown;

function walkForAvailability(
  value: unknown,
  path = "root",
  found: {
    path: string;
    key: string;
    value: unknown;
  }[] = []
) {
  if (Array.isArray(value)) {
    value.forEach((v, i) =>
      walkForAvailability(v, `${path}[${i}]`, found)
    );
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (
        /rawShelfQuantity|shelfQuantity|quantity|available|availability/i.test(
          key
        )
      ) {
        found.push({
          path,
          key,
          value: v,
        });
      }

      walkForAvailability(
        v,
        `${path}.${key}`,
        found
      );
    }
  }

  return found;
}

function positiveAvailability(
  entries: {
    key: string;
    value: unknown;
  }[]
) {
  return entries.some(({ key, value }) => {
    if (
      /quantity/i.test(key) &&
      typeof value === "number"
    ) {
      return value > 0;
    }

    if (
      /available/i.test(key) &&
      typeof value === "boolean"
    ) {
      return value;
    }

    return false;
  });
}

const prismaFallbackStores = [
  "Jumbo",
  "Tikkurila",
  "Kaari Kannelmäki",
  "Itäkeskus",
  "Malmi",
  "Tripla",
  "Olari",
  "Sello",
  "Lippulaiva",
  "REDI",
  "Herttoniemi",
  "Kerava",
  "Järvenpää",
  "Tuusula",
];

let cachedPrismaStores: string[] | null = null;

async function discoverAllPrismaStores() {
  if (cachedPrismaStores?.length) {
    return cachedPrismaStores;
  }

  try {
    const html = await fetchText(
      "https://www.prisma.fi/myymalat",
      20000
    );

    const $ = cheerio.load(html);
    const names = new Set<string>();

    $("a, h1, h2, h3, h4").each(
      (_, element) => {
        const text = compactText(
          $(element).text()
        );

        const match = text.match(
          /^Prisma\s+(.+)$/i
        );

        if (!match) return;

        const name = match[1]
          .replace(
            /\s+(?:Katso palvelut|Myymälän.*)$/i,
            ""
          )
          .trim();

        if (
          name &&
          name.length <= 80
        ) {
          names.add(name);
        }
      }
    );

    if (names.size > 0) {
      cachedPrismaStores = [...names];

      return cachedPrismaStores;
    }
  } catch {
    // Use fallback list below.
  }

  cachedPrismaStores =
    prismaFallbackStores;

  return cachedPrismaStores;
}

async function prismaStoresToCheck() {
  const configured = (
    process.env.PRISMA_STORES || "ALL"
  ).trim();

  if (
    !configured ||
    configured.toUpperCase() === "ALL"
  ) {
    return discoverAllPrismaStores();
  }

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

  const workerCount = Math.max(
    1,
    Math.min(limit, items.length)
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker()
    )
  );

  return results;
}

async function enrichPrisma(
  hit: ProductHit
): Promise<ProductHit> {
  const id = prismaProductId(
    hit.url
  );

  if (!id) {
    return hit;
  }

  const stores =
    await prismaStoresToCheck();

  let anyAvailable =
    hit.status === "available";

  const checks =
    await mapWithConcurrency(
      stores,
      12,
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

          const entries =
            walkForAvailability(json);

          const raw = entries.find(
            (x) =>
              x.key ===
              "rawShelfQuantity"
          );

          const qty =
            typeof raw?.value === "number"
              ? raw.value
              : undefined;

          const available =
            qty !== undefined
              ? qty > 0
              : positiveAvailability(
                  entries
                );

          if (available) {
            anyAvailable = true;
          }

          return {
            store,
            available,
            detail:
              `${store}: ${
                qty !== undefined
                  ? `rawShelfQuantity=${qty}`
                  : available
                  ? "available"
                  : "not available"
              }`,
          };
        } catch (e) {
          return {
            store,
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

  const availableStores = checks
    .filter((x) => x.available)
    .map((x) => x.store);

  const details = checks.map(
    (x) => x.detail
  );

  return {
    ...hit,

    status: anyAvailable
      ? "available"
      : hit.status,

    location:
      availableStores.length
        ? `Available: ${availableStores.join(
            ", "
          )}`
        : details.join(" | "),

    availabilityText: [
      hit.availabilityText,
      ...details,
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

async function scanStore(
  config: StoreConfig
): Promise<StoreScanResult> {
  try {
    const {
      items,
      errors,
    } = await discover(config);

    const products: ProductHit[] =
      [];

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
          await fetchText(item.url);

        let hit =
          parseGenericProductPage({
            html,
            url: item.url,
            fallbackName: item.name,
            store: config.key,
            storeName: config.name,
          });

        if (
          config.key ===
          "swagykarp"
        ) {
          const $ =
            cheerio.load(html);

          const body =
            compactText(
              $("body").text()
            );

          const addButton =
            $(
              "form[action*='/cart/add'] button:not([disabled]), button[name='add']:not([disabled])"
            ).length > 0;

          hit = {
            ...hit,

            status: addButton
              ? "available"
              : statusFromText(body),

            price:
              hit.price ||
              extractPrice(body),

            purchaseLimit:
              hit.purchaseLimit ||
              extractLimit(body),
          };
        }

        if (
          config.key === "prisma"
        ) {
          hit =
            await enrichPrisma(
              hit
            );
        }

        products.push(hit);
      } catch (e) {
        products.push({
          id: `${config.key}:${item.url}`,
          store: config.key,
          storeName: config.name,
          name: item.name,
          url: item.url,
          status: "unknown",
          availabilityText:
            e instanceof Error
              ? e.message
              : String(e),
        });
      }
    }

    return {
      store: config.key,
      storeName: config.name,
      ok:
        errors.length <
        config.discoveryUrls.length,
      products,
      error:
        errors.length
          ? errors.join(" ; ")
          : undefined,
    };
  } catch (e) {
    return {
      store: config.key,
      storeName: config.name,
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
    configs.map(scanStore)
  );
}

export function storeSummary() {
  return configs.map((x) => ({
    key: x.key,
    name: x.name,
    discoveryUrls:
      x.discoveryUrls,
  }));
}

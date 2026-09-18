import * as cheerio from "cheerio";

import {
  loadMonitoredStores,
} from "./database";

import {
  productMatchScore,
} from "./productTerms";

import type {
  AvailabilityState,
  MonitoredStore,
  Product,
} from "./types";

/* ======================================================
   K-RUOKA / K-CITYMARKET
   ====================================================== */

const KRUOKA_HOSTS = [
  "k-ruoka.fi",
  "www.k-ruoka.fi",
];

const KRUOKA_POKEMON_DISCOVERY_URL =
  "https://www.k-ruoka.fi/kauppa/tuotemerkit/pokemon-9909";

const KRUOKA_JUMBO_STORE_URL =
  "https://www.k-ruoka.fi/kauppa/k-citymarket-vantaa-jumbo";

const KRUOKA_PRODUCT_PATH =
  "/kauppa/tuote/";

const JUMBO_STORE_NAME =
  /K[\s--]*Citymarket\s+(?:Vantaa\s+)?Jumbo/i;

const JUMBO_PRICE_CONTEXT =
  /Hinta\s+voimassa\s+valitussa\s+kaupassa\s+K[\s--]*Citymarket\s+(?:Vantaa\s+)?Jumbo/i;

const NOT_AVAILABLE_SELECTED_STORE =
  /Tuote\s+ei\s+ole\s+saatavilla\s+valitsemassasi\s+kaupassa/i;

/* ======================================================
   AVAILABILITY PHRASES
   ====================================================== */

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

/* ======================================================
   HTTP ERROR
   ====================================================== */

class HttpError extends Error {
  status: number;
  url: string;

  constructor(
    url: string,
    status: number,
  ) {
    super(
      `${url} returned HTTP ${status}`,
    );

    this.name =
      "HttpError";

    this.status =
      status;

    this.url =
      url;
  }
}

/* ======================================================
   HELPERS
   ====================================================== */

function clean(
  value: string,
) {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function normalizedHost(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /^www\./,
      "",
    );
}

function sameHost(
  a: string,
  b: string,
) {
  return (
    normalizedHost(a) ===
    normalizedHost(b)
  );
}

function isKRuokaUrl(
  value: string,
) {
  try {
    const url =
      new URL(value);

    return KRUOKA_HOSTS.some(
      (host) =>
        sameHost(
          url.hostname,
          host,
        ),
    );
  } catch {
    return false;
  }
}

function isKRuokaTarget(
  target: MonitoredStore,
) {
  return (
    isKRuokaUrl(
      target.listing_url,
    ) ||
    /k[\s-]*citymarket/i.test(
      target.name,
    )
  );
}

function isJumboTarget(
  target: MonitoredStore,
) {
  return (
    isKRuokaTarget(target) &&
    /jumbo/i.test(
      target.name,
    )
  );
}

/* ======================================================
   HTTP HEADERS
   ====================================================== */

function genericHeaders() {
  return {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/153.0.0.0 Safari/537.36",

    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "accept-language":
      "fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7,sv;q=0.6",

    "cache-control":
      "no-cache",

    pragma:
      "no-cache",
  };
}

function browserRetryHeaders(
  referer?: string,
) {
  return {
    ...genericHeaders(),

    ...(referer
      ? {
          referer,
        }
      : {}),

    "sec-fetch-dest":
      "document",

    "sec-fetch-mode":
      "navigate",

    "sec-fetch-site":
      referer
        ? "same-origin"
        : "none",

    "upgrade-insecure-requests":
      "1",
  };
}

/* ======================================================
   FETCH
   ====================================================== */

async function fetchOnce(
  url: string,
  headers: Record<
    string,
    string
  >,
) {
  const response =
    await fetch(
      url,
      {
        cache:
          "no-store",

        redirect:
          "follow",

        signal:
          AbortSignal.timeout(
            20_000,
          ),

        headers,
      },
    );

  if (
    !response.ok
  ) {
    throw new HttpError(
      url,
      response.status,
    );
  }

  return {
    html:
      await response.text(),

    finalUrl:
      response.url,
  };
}

/**
 * Generic store request.
 *
 * First attempt uses normal browser headers.
 * If the shop responds with 403 or 429,
 * one browser-navigation style retry is made.
 */
async function fetchPage(
  url: string,
) {
  try {
    return await fetchOnce(
      url,
      genericHeaders(),
    );
  } catch (error) {
    if (
      error instanceof
        HttpError &&
      (
        error.status ===
          403 ||
        error.status ===
          429
      )
    ) {
      return fetchOnce(
        url,
        browserRetryHeaders(),
      );
    }

    throw error;
  }
}

/**
 * K-Ruoka request.
 *
 * Uses the K-Citymarket Jumbo store page as the
 * referrer so the request resembles navigation
 * inside the K-Ruoka site.
 */
async function fetchKRuokaPage(
  url: string,
) {
  try {
    return await fetchOnce(
      url,
      browserRetryHeaders(
        KRUOKA_JUMBO_STORE_URL,
      ),
    );
  } catch (error) {
    if (
      error instanceof
        HttpError &&
      (
        error.status ===
          403 ||
        error.status ===
          429
      )
    ) {
      /*
       * Retry using the Pokémon catalogue
       * as the navigation source.
       */
      try {
        return await fetchOnce(
          url,
          browserRetryHeaders(
            KRUOKA_POKEMON_DISCOVERY_URL,
          ),
        );
      } catch (
        retryError
      ) {
        if (
          retryError instanceof
            HttpError &&
          (
            retryError.status ===
              403 ||
            retryError.status ===
              429
          )
        ) {
          throw new Error(
            `K-Ruoka blocked the server request with HTTP ${retryError.status}.`,
          );
        }

        throw retryError;
      }
    }

    throw error;
  }
}

/* ======================================================
   JSON-LD
   ====================================================== */

function parseJsonLd(
  $: cheerio.CheerioAPI,
) {
  const values:
    unknown[] = [];

  $(
    "script[type='application/ld+json']",
  ).each(
    (_, element) => {
      const raw =
        $(element)
          .text()
          .trim();

      if (!raw) {
        return;
      }

      try {
        values.push(
          JSON.parse(
            raw,
          ),
        );
      } catch {
        // Ignore malformed JSON-LD.
      }
    },
  );

  return values;
}

function walkJson(
  value: unknown,
  visit: (
    record: Record<
      string,
      unknown
    >,
  ) => void,
) {
  if (
    Array.isArray(
      value,
    )
  ) {
    for (
      const item of value
    ) {
      walkJson(
        item,
        visit,
      );
    }

    return;
  }

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  visit(record);

  for (
    const item of Object.values(
      record,
    )
  ) {
    walkJson(
      item,
      visit,
    );
  }
}

function structuredSignals(
  $: cheerio.CheerioAPI,
) {
  const availability:
    string[] = [];

  const skus:
    string[] = [];

  const prices:
    string[] = [];

  let hasProductSchema =
    false;

  for (
    const root of parseJsonLd(
      $,
    )
  ) {
    walkJson(
      root,
      (record) => {
        const type =
          record["@type"];

        const types =
          Array.isArray(
            type,
          )
            ? type
            : [type];

        if (
          types.some(
            (item) =>
              String(
                item,
              ).toLowerCase() ===
              "product",
          )
        ) {
          hasProductSchema =
            true;
        }

        const rawAvailability =
          record.availability;

        if (
          typeof rawAvailability ===
          "string"
        ) {
          availability.push(
            rawAvailability,
          );
        }

        for (
          const key of [
            "sku",
            "mpn",
            "productID",
            "productId",
            "product_id",
          ]
        ) {
          const item =
            record[key];

          if (
            typeof item ===
              "string" &&
            clean(item)
          ) {
            skus.push(
              clean(item),
            );
          }
        }

        const price =
          record.price;

        if (
          typeof price ===
            "string" ||
          typeof price ===
            "number"
        ) {
          const currency =
            typeof record.priceCurrency ===
            "string"
              ? ` ${record.priceCurrency}`
              : "";

          prices.push(
            `${price}${currency}`,
          );
        }
      },
    );
  }

  const metaAvailability = [
    $(
      "meta[itemprop='availability']",
    ).attr(
      "content",
    ),

    $(
      "link[itemprop='availability']",
    ).attr(
      "href",
    ),

    $(
      "meta[property='product:availability']",
    ).attr(
      "content",
    ),
  ].filter(
    (
      value,
    ): value is string =>
      Boolean(
        value,
      ),
  );

  availability.push(
    ...metaAvailability,
  );

  const metaSku =
    $(
      "meta[itemprop='sku']",
    ).attr(
      "content",
    ) ||
    $(
      "[itemprop='sku']",
    )
      .first()
      .attr(
        "content",
      ) ||
    $(
      "[itemprop='sku']",
    )
      .first()
      .text();

  if (
    metaSku
  ) {
    skus.push(
      clean(
        metaSku,
      ),
    );
  }

  return {
    availability: [
      ...new Set(
        availability,
      ),
    ],

    sku: [
      ...new Set(
        skus,
      ),
    ][0],

    price:
      prices[0],

    hasProductSchema,
  };
}

/* ======================================================
   PRODUCT AREA
   ====================================================== */

function getProductAreaText(
  $: cheerio.CheerioAPI,
) {
  const selectors = [
    "[itemtype*='Product']",
    "[data-product-id]",
    "[data-product]",
    ".product-page",
    ".product-detail",
    ".product-details",
    "main",
  ];

  for (
    const selector of selectors
  ) {
    const element =
      $(selector)
        .first();

    const text =
      clean(
        element.text(),
      );

    if (
      text.length >
      80
    ) {
      return text;
    }
  }

  return clean(
    $("body").text(),
  );
}

/* ======================================================
   BUTTONS / CONTROLS
   ====================================================== */

function isHiddenOrDisabled(
  $: cheerio.CheerioAPI,
  element: any,
) {
  const node =
    $(element);

  const classes =
    (
      node.attr(
        "class",
      ) || ""
    ).toLowerCase();

  const style =
    (
      node.attr(
        "style",
      ) || ""
    ).toLowerCase();

  return Boolean(
    node.attr(
      "disabled",
    ) !== undefined ||

      node.attr(
        "hidden",
      ) !== undefined ||

      node.attr(
        "aria-disabled",
      ) === "true" ||

      node.attr(
        "aria-hidden",
      ) === "true" ||

      /(?:^|\s)(?:disabled|is-disabled|unavailable)(?:\s|$)/.test(
        classes,
      ) ||

      /display\s*:\s*none|visibility\s*:\s*hidden/.test(
        style,
      ),
  );
}

function purchaseControls(
  $: cheerio.CheerioAPI,
) {
  let activeBuy =
    false;

  let watch =
    false;

  const labels:
    string[] = [];

  $(
    "button, a[href], input[type='submit'], input[type='button']",
  ).each(
    (_, element) => {
      const node =
        $(element);

      const label =
        clean(
          node.text() ||
            node.attr(
              "value",
            ) ||
            node.attr(
              "aria-label",
            ) ||
            node.attr(
              "title",
            ) ||
            "",
        );

      if (
        !label
      ) {
        return;
      }

      if (
        WATCH_ONLY.test(
          label,
        )
      ) {
        watch =
          true;

        labels.push(
          label,
        );
      }

      if (
        BUY_ACTION.test(
          label,
        ) &&
        !isHiddenOrDisabled(
          $,
          element,
        )
      ) {
        activeBuy =
          true;

        labels.push(
          label,
        );
      }
    },
  );

  return {
    activeBuy,

    watch,

    labels: [
      ...new Set(
        labels,
      ),
    ].slice(
      0,
      10,
    ),
  };
}

/* ======================================================
   METADATA
   ====================================================== */

function extractPrice(
  $: cheerio.CheerioAPI,
  structuredPrice?: string,
) {
  const metaPrice =
    $(
      "meta[property='product:price:amount']",
    ).attr(
      "content",
    ) ||
    $(
      "meta[itemprop='price']",
    ).attr(
      "content",
    );

  const visiblePrice =
    clean(
      $(
        [
          "[itemprop='price']",
          ".product-price",
          ".price",
          "[class*='product'][class*='price']",
          "[data-testid*='price']",
        ].join(
          ", ",
        ),
      )
        .first()
        .text(),
    );

  return (
    visiblePrice ||
    metaPrice ||
    structuredPrice ||
    undefined
  );
}

function extractKRuokaPrice(
  text: string,
) {
  const match =
    text.match(
      /Hinta\s+(\d{1,4}[,.]\d{2})\s*€/i,
    );

  if (
    match?.[1]
  ) {
    return `${
      match[1].replace(
        ",",
        ".",
      )
    } €`;
  }

  return undefined;
}

function extractSku(
  $: cheerio.CheerioAPI,
  html: string,
  structuredSku?: string,
) {
  if (
    structuredSku
  ) {
    return structuredSku;
  }

  const dataSku =
    $(
      "[data-sku]",
    )
      .first()
      .attr(
        "data-sku",
      );

  if (
    dataSku
  ) {
    return clean(
      dataSku,
    );
  }

  const textSku =
    clean(
      $(
        [
          "[itemprop='sku']",
          ".sku",
          "[class*='sku']",
        ].join(
          ", ",
        ),
      )
        .first()
        .text(),
    );

  if (
    textSku
  ) {
    return textSku;
  }

  const codeMatch =
    html.match(
      /["'](?:sku|productSku|manufacturerSku|articleNumber|productCode)["']\s*:\s*["']([^"']{2,80})["']/i,
    );

  return codeMatch?.[
    1
  ]
    ? clean(
        codeMatch[
          1
        ],
      )
    : undefined;
}

function extractKRuokaEan(
  url: string,
  text: string,
) {
  const urlMatch =
    url.match(
      /(\d{12,14})(?:-[a-z0-9]+)?(?:\?|$)/i,
    );

  if (
    urlMatch?.[1]
  ) {
    return urlMatch[1];
  }

  const textMatch =
    text.match(
      /EAN(?:-koodi)?\s*:?\s*(\d{12,14})/i,
    );

  return textMatch?.[1];
}

function extractStockText(
  productText: string,
) {
  const match =
    productText.match(
      STOCK_SNIPPET,
    );

  return match?.[
    0
  ]
    ? clean(
        match[
          0
        ],
      )
    : undefined;
}

function extractVisibleStatus(
  productText: string,
) {
  const patterns = [
    FULLY_BOOKED,
    COMING_SOON,
    OUT_OF_STOCK,
    WATCH_ONLY,
    PREORDER,
    IN_STOCK,
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      productText.match(
        pattern,
      );

    if (
      match?.[0]
    ) {
      return clean(
        match[0],
      );
    }
  }

  return undefined;
}

/* ======================================================
   STRUCTURED AVAILABILITY
   ====================================================== */

function availabilityFromStructured(
  values: string[],
): AvailabilityState | undefined {
  const joined =
    values
      .join(
        " ",
      )
      .toLowerCase();

  if (
    /preorder|pre-order|presale|pre-sale/.test(
      joined,
    )
  ) {
    return "preorder";
  }

  if (
    /instock|in-stock|limitedavailability/.test(
      joined,
    )
  ) {
    return "in_stock";
  }

  if (
    /outofstock|out-of-stock|soldout|discontinued/.test(
      joined,
    )
  ) {
    return "out_of_stock";
  }

  return undefined;
}

/* ======================================================
   GENERIC CLASSIFIER
   ====================================================== */

function classifyPage(
  productText: string,
  structuredAvailability: string[],
  controls: ReturnType<
    typeof purchaseControls
  >,
) {
  const evidence:
    string[] = [];

  const structuredState =
    availabilityFromStructured(
      structuredAvailability,
    );

  /* BLOCKERS */

  if (
    FULLY_BOOKED.test(
      productText,
    )
  ) {
    evidence.push(
      "Store says Fully booked",
    );

    return {
      state:
        "fully_booked" as const,

      available:
        false,

      evidence,
    };
  }

  if (
    COMING_SOON.test(
      productText,
    )
  ) {
    evidence.push(
      "Store says Coming soon",
    );

    if (
      controls.activeBuy
    ) {
      evidence.push(
        "Purchase control ignored because Coming Soon takes priority",
      );
    }

    return {
      state:
        "coming_soon" as const,

      available:
        false,

      evidence,
    };
  }

  if (
    OUT_OF_STOCK.test(
      productText,
    ) ||
    structuredState ===
      "out_of_stock"
  ) {
    evidence.push(
      "Store says Out of stock",
    );

    return {
      state:
        "out_of_stock" as const,

      available:
        false,

      evidence,
    };
  }

  if (
    controls.watch &&
    !controls.activeBuy
  ) {
    evidence.push(
      "Only Watch / Follow / Notify control is available",
    );

    return {
      state:
        "watch_only" as const,

      available:
        false,

      evidence,
    };
  }

  /* POSITIVE */

  if (
    structuredState ===
    "preorder"
  ) {
    evidence.push(
      "Structured availability says PreOrder",
    );

    return {
      state:
        "preorder" as const,

      available:
        true,

      evidence,
    };
  }

  if (
    structuredState ===
    "in_stock"
  ) {
    evidence.push(
      "Structured availability says InStock",
    );

    return {
      state:
        "in_stock" as const,

      available:
        true,

      evidence,
    };
  }

  if (
    PREORDER.test(
      productText,
    ) &&
    controls.activeBuy
  ) {
    evidence.push(
      "Preorder wording and active purchase control detected",
    );

    return {
      state:
        "preorder" as const,

      available:
        true,

      evidence,
    };
  }

  if (
    controls.activeBuy
  ) {
    evidence.push(
      "Active purchase control found with no blocking status",
    );

    return {
      state:
        "in_stock" as const,

      available:
        true,

      evidence,
    };
  }

  if (
    IN_STOCK.test(
      productText,
    ) &&
    !controls.watch
  ) {
    evidence.push(
      "Visible In Stock wording detected",
    );

    return {
      state:
        "in_stock" as const,

      available:
        true,

      evidence,
    };
  }

  evidence.push(
    "No trustworthy purchasable state detected",
  );

  return {
    state:
      "unknown" as const,

    available:
      false,

    evidence,
  };
}

/* ======================================================
   PRODUCT PAGE DETECTION
   ====================================================== */

function directPageLooksLikeProduct(
  $: cheerio.CheerioAPI,
  wantedName: string,
  hasProductSchema: boolean,
) {
  if (
    hasProductSchema
  ) {
    return true;
  }

  if (
    $(
      "meta[property='og:type'][content='product']",
    ).length > 0
  ) {
    return true;
  }

  const h1 =
    clean(
      $("h1")
        .first()
        .text(),
    );

  return (
    productMatchScore(
      h1,
      wantedName,
    ) >= 60
  );
}

/* ======================================================
   PRODUCT LINK DISCOVERY
   ====================================================== */

function candidateLinks(
  html: string,
  baseUrl: string,
  wantedName: string,
  options?: {
    productPath?:
      string;

    allowedHosts?:
      string[];
  },
) {
  const $ =
    cheerio.load(
      html,
    );

  const baseHost =
    new URL(
      baseUrl,
    ).hostname;

  const allowedHosts =
    options
      ?.allowedHosts ||
    [baseHost];

  const candidates =
    new Map<
      string,
      {
        title: string;
        score: number;
      }
    >();

  $(
    "a[href]",
  ).each(
    (_, element) => {
      const href =
        $(element).attr(
          "href",
        );

      if (
        !href
      ) {
        return;
      }

      const label =
        clean(
          $(element).text() ||
            $(element).attr(
              "aria-label",
            ) ||
            $(element).attr(
              "title",
            ) ||
            "",
        );

      const score =
        productMatchScore(
          label,
          wantedName,
        );

      if (
        score < 45
      ) {
        return;
      }

      try {
        const url =
          new URL(
            href,
            baseUrl,
          );

        if (
          ![
            "http:",
            "https:",
          ].includes(
            url.protocol,
          )
        ) {
          return;
        }

        const hostAllowed =
          allowedHosts.some(
            (host) =>
              sameHost(
                host,
                url.hostname,
              ),
          );

        if (
          !hostAllowed
        ) {
          return;
        }

        if (
          options?.productPath &&
          !url.pathname.includes(
            options.productPath,
          )
        ) {
          return;
        }

        /*
         * Keep meaningful query strings for shops
         * that use them, but remove tracking hash.
         */
        url.hash =
          "";

        const key =
          url.toString();

        const existing =
          candidates.get(
            key,
          );

        if (
          !existing ||
          score >
            existing.score
        ) {
          candidates.set(
            key,
            {
              title:
                label,

              score,
            },
          );
        }
      } catch {
        // Ignore malformed URL.
      }
    },
  );

  return [
    ...candidates.entries(),
  ]
    .sort(
      (
        a,
        b,
      ) =>
        b[1].score -
        a[1].score,
    )
    .slice(
      0,
      8,
    );
}

/* ======================================================
   GENERIC PRODUCT INSPECTOR
   ====================================================== */

async function inspectProductPage(
  store: string,
  wantedName: string,
  url: string,
  fallbackTitle?: string,
): Promise<Product> {
  const {
    html,
    finalUrl,
  } =
    await fetchPage(
      url,
    );

  const $ =
    cheerio.load(
      html,
    );

  const productText =
    getProductAreaText(
      $,
    );

  const structured =
    structuredSignals(
      $,
    );

  const controls =
    purchaseControls(
      $,
    );

  const classification =
    classifyPage(
      productText,
      structured.availability,
      controls,
    );

  const title =
    clean(
      $("h1")
        .first()
        .text(),
    ) ||
    clean(
      $(
        "meta[property='og:title']",
      ).attr(
        "content",
      ) || "",
    ) ||
    fallbackTitle ||
    wantedName;

  const evidence = [
    ...classification.evidence,
  ];

  if (
    structured.availability.length >
    0
  ) {
    evidence.push(
      `Structured availability: ${structured.availability.join(
        ", ",
      )}`,
    );
  }

  if (
    controls.labels.length >
    0
  ) {
    evidence.push(
      `Controls: ${controls.labels.join(
        " | ",
      )}`,
    );
  }

  return {
    store,

    title,

    url:
      finalUrl,

    price:
      extractPrice(
        $,
        structured.price,
      ),

    sku:
      extractSku(
        $,
        html,
        structured.sku,
      ),

    stockText:
      extractStockText(
        productText,
      ),

    statusText:
      extractVisibleStatus(
        productText,
      ),

    state:
      classification.state,

    available:
      classification.available,

    evidence: [
      ...new Set(
        evidence,
      ),
    ].slice(
      0,
      12,
    ),
  };
}

/* ======================================================
   K-RUOKA PRODUCT INSPECTOR
   ====================================================== */

async function inspectKRuokaProduct(
  target: MonitoredStore,
  url: string,
  fallbackTitle?: string,
): Promise<Product> {
  const {
    html,
    finalUrl,
  } =
    await fetchKRuokaPage(
      url,
    );

  const $ =
    cheerio.load(
      html,
    );

  const productText =
    getProductAreaText(
      $,
    );

  const fullBody =
    clean(
      $("body").text(),
    );

  const title =
    clean(
      $("h1")
        .first()
        .text(),
    ) ||
    clean(
      $(
        "meta[property='og:title']",
      ).attr(
        "content",
      ) || "",
    ) ||
    fallbackTitle ||
    target.product_name ||
    "Product";

  const controls =
    purchaseControls(
      $,
    );

  const structured =
    structuredSignals(
      $,
    );

  const evidence:
    string[] = [];

  const jumboTarget =
    isJumboTarget(
      target,
    );

  const jumboScoped =
    JUMBO_PRICE_CONTEXT.test(
      productText,
    ) ||
    JUMBO_PRICE_CONTEXT.test(
      fullBody,
    );

  const jumboMentioned =
    JUMBO_STORE_NAME.test(
      fullBody,
    );

  const selectedStoreUnavailable =
    NOT_AVAILABLE_SELECTED_STORE.test(
      productText,
    ) ||
    NOT_AVAILABLE_SELECTED_STORE.test(
      fullBody,
    );

  /*
   * Important:
   *
   * If the page says the currently selected store
   * doesn't have the product, but then mentions Jumbo
   * elsewhere as a nearby/local store, we CANNOT treat
   * that as "Jumbo out of stock".
   *
   * That only means the page is using the wrong selected
   * store context.
   */
  if (
    jumboTarget &&
    selectedStoreUnavailable &&
    jumboMentioned &&
    !jumboScoped
  ) {
    evidence.push(
      "K-Ruoka page is not currently scoped to K-Citymarket Jumbo.",
    );

    evidence.push(
      "Jumbo is mentioned, but the selected-store availability cannot be trusted.",
    );

    return {
      store:
        target.name,

      title,

      url:
        finalUrl,

      price:
        extractKRuokaPrice(
          productText,
        ) ||
        extractPrice(
          $,
          structured.price,
        ),

      sku:
        extractKRuokaEan(
          finalUrl,
          productText,
        ) ||
        extractSku(
          $,
          html,
          structured.sku,
        ),

      statusText:
        "Store context required",

      state:
        "unknown",

      available:
        false,

      evidence,
    };
  }

  /*
   * Strong Jumbo context:
   *
   * "Hinta voimassa valitussa kaupassa
   *  K-Citymarket Jumbo"
   */
  if (
    jumboTarget &&
    jumboScoped
  ) {
    evidence.push(
      "K-Ruoka availability is scoped to K-Citymarket Jumbo.",
    );
  }

  /*
   * Blockers.
   */
  if (
    FULLY_BOOKED.test(
      productText,
    )
  ) {
    return {
      store:
        target.name,

      title,

      url:
        finalUrl,

      price:
        extractKRuokaPrice(
          productText,
        ),

      sku:
        extractKRuokaEan(
          finalUrl,
          productText,
        ),

      statusText:
        "Fully booked",

      state:
        "fully_booked",

      available:
        false,

      evidence: [
        ...evidence,
        "Product is fully booked.",
      ],
    };
  }

  if (
    COMING_SOON.test(
      productText,
    )
  ) {
    return {
      store:
        target.name,

      title,

      url:
        finalUrl,

      price:
        extractKRuokaPrice(
          productText,
        ),

      sku:
        extractKRuokaEan(
          finalUrl,
          productText,
        ),

      statusText:
        "Coming soon",

      state:
        "coming_soon",

      available:
        false,

      evidence: [
        ...evidence,
        "Product is coming soon.",
      ],
    };
  }

  /*
   * If Jumbo itself is definitely selected and the
   * product isn't available, this can safely be treated
   * as out of stock / unavailable.
   */
  if (
    jumboTarget &&
    jumboScoped &&
    selectedStoreUnavailable
  ) {
    return {
      store:
        target.name,

      title,

      url:
        finalUrl,

      price:
        extractKRuokaPrice(
          productText,
        ),

      sku:
        extractKRuokaEan(
          finalUrl,
          productText,
        ),

      statusText:
        "Not available at Jumbo",

      state:
        "out_of_stock",

      available:
        false,

      evidence: [
        ...evidence,
        "K-Citymarket Jumbo is selected and the product is unavailable.",
      ],
    };
  }

  /*
   * K-Ruoka online ordering signal.
   */
  if (
    jumboTarget &&
    jumboScoped &&
    controls.activeBuy
  ) {
    return {
      store:
        target.name,

      title,

      url:
        finalUrl,

      price:
        extractKRuokaPrice(
          productText,
        ) ||
        extractPrice(
          $,
          structured.price,
        ),

      sku:
        extractKRuokaEan(
          finalUrl,
          productText,
        ) ||
        extractSku(
          $,
          html,
          structured.sku,
        ),

      stockText:
        extractStockText(
          productText,
        ),

      statusText:
        "Available at Jumbo",

      state:
        PREORDER.test(
          productText,
        )
          ? "preorder"
          : "in_stock",

      available:
        true,

      evidence: [
        ...evidence,
        "K-Citymarket Jumbo context confirmed.",
        "Active purchase control detected.",
      ],
    };
  }

  /*
   * Generic K-Ruoka product fallback.
   */
  const classification =
    classifyPage(
      productText,
      structured.availability,
      controls,
    );

  return {
    store:
      target.name,

    title,

    url:
      finalUrl,

    price:
      extractKRuokaPrice(
        productText,
      ) ||
      extractPrice(
        $,
        structured.price,
      ),

    sku:
      extractKRuokaEan(
        finalUrl,
        productText,
      ) ||
      extractSku(
        $,
        html,
        structured.sku,
      ),

    stockText:
      extractStockText(
        productText,
      ),

    statusText:
      extractVisibleStatus(
        productText,
      ),

    state:
      classification.state,

    available:
      classification.available,

    evidence: [
      ...evidence,
      ...classification.evidence,
    ].slice(
      0,
      12,
    ),
  };
}

/* ======================================================
   K-RUOKA / JUMBO ADAPTER
   ====================================================== */

async function scanKRuokaTarget(
  target: MonitoredStore,
): Promise<Product> {
  const wantedName =
    target.product_name?.trim() ||
    target.name;

  /*
   * STEP 1
   *
   * Restore the old working behaviour:
   * start from K-Ruoka's Pokémon catalogue.
   */
  let discoveryHtml:
    string | null = null;

  let discoveryUrl =
    KRUOKA_POKEMON_DISCOVERY_URL;

  try {
    const discovery =
      await fetchKRuokaPage(
        KRUOKA_POKEMON_DISCOVERY_URL,
      );

    discoveryHtml =
      discovery.html;

    discoveryUrl =
      discovery.finalUrl;
  } catch (
    discoveryError
  ) {
    /*
     * If catalogue discovery fails but the user supplied
     * an exact K-Ruoka product URL, try that product
     * directly before giving up.
     */
    try {
      const supplied =
        new URL(
          target.listing_url,
        );

      if (
        supplied.pathname.includes(
          KRUOKA_PRODUCT_PATH,
        )
      ) {
        return await inspectKRuokaProduct(
          target,
          target.listing_url,
          wantedName,
        );
      }
    } catch {
      // Ignore invalid URL here.
    }

    throw discoveryError;
  }

  /*
   * STEP 2
   *
   * Find product candidates from catalogue using the
   * smarter ETB / UPC / Booster matcher.
   */
  if (
    discoveryHtml
  ) {
    const candidates =
      candidateLinks(
        discoveryHtml,
        discoveryUrl,
        wantedName,
        {
          productPath:
            KRUOKA_PRODUCT_PATH,

          allowedHosts:
            KRUOKA_HOSTS,
        },
      );

    for (
      const [
        url,
        candidate,
      ] of candidates
    ) {
      try {
        const product =
          await inspectKRuokaProduct(
            target,
            url,
            candidate.title,
          );

        if (
          productMatchScore(
            product.title,
            wantedName,
          ) >= 45
        ) {
          product.evidence.unshift(
            `Matched from K-Ruoka Pokémon catalogue: ${candidate.title}`,
          );

          return product;
        }
      } catch {
        /*
         * One candidate can fail without killing
         * the whole store scan.
         */
      }
    }
  }

  /*
   * STEP 3
   *
   * If user gave an exact product URL, use it as
   * the final fallback.
   */
  try {
    const supplied =
      new URL(
        target.listing_url,
      );

    if (
      supplied.pathname.includes(
        KRUOKA_PRODUCT_PATH,
      )
    ) {
      const product =
        await inspectKRuokaProduct(
          target,
          target.listing_url,
          wantedName,
        );

      if (
        productMatchScore(
          product.title,
          wantedName,
        ) >= 45
      ) {
        product.evidence.unshift(
          "Used supplied K-Ruoka product URL as fallback.",
        );

        return product;
      }
    }
  } catch {
    // Ignore.
  }

  /*
   * No confident match.
   */
  return {
    store:
      target.name,

    title:
      wantedName,

    url:
      KRUOKA_POKEMON_DISCOVERY_URL,

    statusText:
      "Product not found",

    state:
      "unknown",

    available:
      false,

    evidence: [
      "K-Ruoka Pokémon catalogue was checked.",
      `No confident match was found for "${wantedName}".`,
      "Try using a more specific product name or the exact K-Ruoka product URL.",
    ],
  };
}

/* ======================================================
   GENERIC STORE SCANNER
   ====================================================== */

async function scanGenericTarget(
  target: MonitoredStore,
): Promise<Product> {
  const wantedName =
    target.product_name?.trim() ||
    target.name;

  const {
    html,
    finalUrl,
  } =
    await fetchPage(
      target.listing_url,
    );

  const $ =
    cheerio.load(
      html,
    );

  const structured =
    structuredSignals(
      $,
    );

  /*
   * Exact product page.
   */
  if (
    directPageLooksLikeProduct(
      $,
      wantedName,
      structured.hasProductSchema,
    )
  ) {
    return inspectProductPage(
      target.name,
      wantedName,
      finalUrl,
    );
  }

  /*
   * Category/store/search page.
   */
  const candidates =
    candidateLinks(
      html,
      finalUrl,
      wantedName,
    );

  for (
    const [
      url,
      candidate,
    ] of candidates
  ) {
    try {
      const product =
        await inspectProductPage(
          target.name,
          wantedName,
          url,
          candidate.title,
        );

      if (
        productMatchScore(
          product.title,
          wantedName,
        ) >= 45
      ) {
        product.evidence.unshift(
          `Matched product: ${candidate.title}`,
        );

        return product;
      }
    } catch {
      // Try next candidate.
    }
  }

  return {
    store:
      target.name,

    title:
      wantedName,

    url:
      finalUrl,

    statusText:
      "Product not found",

    state:
      "unknown",

    available:
      false,

    evidence: [
      "Product could not be confidently identified.",
      "Use a more specific product name or an exact product page URL.",
    ],
  };
}

/* ======================================================
   MAIN SINGLE-TARGET ROUTER
   ====================================================== */

export async function scanTarget(
  target: MonitoredStore,
): Promise<Product> {
  /*
   * K-Ruoka gets its dedicated adapter.
   *
   * Everything else stays generic.
   */
  if (
    isKRuokaTarget(
      target,
    )
  ) {
    return scanKRuokaTarget(
      target,
    );
  }

  return scanGenericTarget(
    target,
  );
}

/* ======================================================
   SCAN ALL MONITORED PRODUCTS
   ====================================================== */

export async function scanStores() {
  const products:
    Product[] = [];

  const errors:
    string[] = [];

  let targets:
    MonitoredStore[] = [];

  try {
    targets =
      await loadMonitoredStores();
  } catch (error) {
    return {
      products,

      errors: [
        `Could not load monitors: ${String(
          error,
        )}`,
      ],
    };
  }

  for (
    const target of targets
  ) {
    try {
      products.push(
        await scanTarget(
          target,
        ),
      );
    } catch (error) {
      errors.push(
        `${target.name} / ${
          target.product_name ||
          target.listing_url
        }: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  return {
    products,
    errors,
  };
}

/* ======================================================
   CHECK-STOCK ROUTE COMPATIBILITY
   ====================================================== */

export const filterDescription =
  "User-configured product monitoring. K-Citymarket Jumbo uses a dedicated K-Ruoka catalogue adapter. Other stores use the generic product monitor. Alerts trigger only for genuinely orderable In Stock or Preorder products.";

/* ======================================================
   STATUS LABELS
   ====================================================== */

export const stateLabel: Record<
  AvailabilityState,
  string
> = {
  in_stock:
    "In stock",

  preorder:
    "Preorder",

  coming_soon:
    "Coming soon",

  fully_booked:
    "Fully booked",

  out_of_stock:
    "Out of stock",

  watch_only:
    "Unavailable",

  unknown:
    "Unknown",
};

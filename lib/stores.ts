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
   Availability phrases
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
   Helpers
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

async function fetchPage(
  url: string,
) {
  const response =
    await fetch(
      url,
      {
        cache: "no-store",

        redirect:
          "follow",

        signal:
          AbortSignal.timeout(
            20_000,
          ),

        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; PokeDexAlert/3.0; personal availability monitor)",

          accept:
            "text/html,application/xhtml+xml",

          "accept-language":
            "fi-FI,fi;q=0.9,en;q=0.8,sv;q=0.7",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `${url} returned HTTP ${response.status}`,
    );
  }

  return {
    html:
      await response.text(),

    finalUrl:
      response.url,
  };
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
        // Ignore broken JSON-LD.
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

  visit(
    record,
  );

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
          record[
            "@type"
          ];

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
          const value =
            record[
              key
            ];

          if (
            typeof value ===
              "string" &&
            clean(value)
          ) {
            skus.push(
              clean(
                value,
              ),
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
   Product text area
   ====================================================== */

/**
 * Try to focus on the main product section rather
 * than scanning unrelated recommended products.
 */
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
    const node =
      $(selector)
        .first();

    const text =
      clean(
        node.text(),
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
   Controls
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
        watch = true;

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
   Metadata
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
      match?.[
        0
      ]
    ) {
      return clean(
        match[
          0
        ],
      );
    }
  }

  return undefined;
}

/* ======================================================
   Structured availability
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
   Availability classifier
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

  /*
   * BLOCKING states always win.
   */

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
        "Add-to-cart control ignored because Coming Soon takes priority",
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

  /*
   * Positive states.
   */

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

  /*
   * Add to cart can count only if there
   * are no blocking statuses.
   */
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
      "Visible in-stock wording detected",
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
   Product page detection
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
   Search/category product matching
   ====================================================== */

function candidateLinks(
  html: string,
  baseUrl: string,
  wantedName: string,
) {
  const $ =
    cheerio.load(
      html,
    );

  const baseHost =
    new URL(
      baseUrl,
    ).hostname;

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

        if (
          url.hostname !==
          baseHost
        ) {
          return;
        }

        url.hash =
          "";

        const urlString =
          url.toString();

        const existing =
          candidates.get(
            urlString,
          );

        if (
          !existing ||
          score >
            existing.score
        ) {
          candidates.set(
            urlString,
            {
              title:
                label,

              score,
            },
          );
        }
      } catch {
        // Invalid URL.
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
        b[
          1
        ].score -
        a[
          1
        ].score,
    )
    .slice(
      0,
      5,
    );
}

/* ======================================================
   Inspect product
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

  try {
    const hostname =
      new URL(
        finalUrl,
      ).hostname;

    if (
      /k-ruoka\.fi$/i.test(
        hostname,
      ) &&
      /K[--]?Citymarket\s+(?:Vantaa\s+)?Jumbo/i.test(
        productText,
      )
    ) {
      evidence.push(
        "K-Citymarket Jumbo detected in page context",
      );
    }
  } catch {
    // Ignore.
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
   Scan one configured product
   ====================================================== */

export async function scanTarget(
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

    state:
      "unknown",

    available:
      false,

    evidence: [
      "Product could not be confidently identified",
      "For best results use the exact product page URL",
    ],
  };
}

/* ======================================================
   Scan everything
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
        }: ${String(
          error,
        )}`,
      );
    }
  }

  return {
    products,
    errors,
  };
}

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

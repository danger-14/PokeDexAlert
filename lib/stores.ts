import * as cheerio from "cheerio";
import type { Product } from "./types";

const stores = [
  {
    store: "PokePulls",
    url: "https://pokepulls.fi/kategoria/ennakkotilattavissa",
    hosts: ["pokepulls.fi"],
    productPath: "/tuote/",
  },
  {
    store: "TCG Kauppa",
    url: "https://www.tcgkauppa.fi/pokemon-30th-celebration/",
    hosts: ["www.tcgkauppa.fi", "tcgkauppa.fi"],
    productPath: "/tuote/",
  },
  {
    store: "Swagykarp",
    url: "https://swagykarp.fi/product-category/pokemon-expansions/30th-celebration/",
    hosts: ["swagykarp.fi"],
    productPath: "/product/",
  },
] as const;

const anniversary =
  /(?:30th\s+(?:anniversary|celebration)|30\s*(?:th)?\s*(?:anniversary|celebration)|30-vuot)/i;

const wantedProduct =
  /(?:\betb\b|elite\s+trainer\s+box|booster\s+(?:box|display|bundle)|\bupc\b|ultra[\s-]*premium\s+collection)/i;

const unavailable =
  /(?:loppuunmyyty|loppu\s+varastosta|varasto\s+loppu|ei\s+varastossa|out\s+of\s+stock|sold\s+out)/i;

const purchaseSignal =
  /(?:lisää\s+ostoskoriin|osta|pre[\s-]*order|add\s+to\s+(?:cart|basket)|tilaa)/i;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function matchesWantedProduct(title: string) {
  return anniversary.test(title) && wantedProduct.test(title);
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; PokeDexAlert/1.0; personal availability alerts)",
      accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`${url} returned status ${response.status}`);
  }

  return response.text();
}

function findProductLinks(
  html: string,
  baseUrl: string,
  allowedHosts: readonly string[],
  productPath: string,
) {
  const $ = cheerio.load(html);
  const links = new Map<string, string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    try {
      const url = new URL(href, baseUrl);

      if (
        !allowedHosts.includes(url.hostname) ||
        !url.pathname.includes(productPath)
      ) {
        return;
      }

      url.search = "";
      url.hash = "";

      const title = clean($(element).text());

      if (matchesWantedProduct(title)) {
        links.set(url.toString(), title);
      }
    } catch {
      // Ignore malformed links.
    }
  });

  return links;
}

async function inspectProduct(
  store: string,
  url: string,
  fallbackTitle: string,
): Promise<Product> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title = clean($("h1").first().text()) || fallbackTitle;
  const bodyText = clean($("body").text());

  const price =
    clean(
      $(".summary .price, .product .price, [class*='price']")
        .first()
        .text(),
    ) || undefined;

  const hasPurchaseButton =
    $(
      "form.cart button, button[name='add-to-cart'], " +
        ".single_add_to_cart_button, a.add_to_cart_button",
    ).length > 0;

  const available =
    !unavailable.test(bodyText) &&
    (hasPurchaseButton || purchaseSignal.test(bodyText));

  return {
    store,
    title,
    url,
    price,
    available,
  };
}

export async function scanStores() {
  const products: Product[] = [];
  const errors: string[] = [];

  for (const config of stores) {
    try {
      const listingHtml = await fetchHtml(config.url);

      const links = findProductLinks(
        listingHtml,
        config.url,
        config.hosts,
        config.productPath,
      );

      const results = await Promise.allSettled(
        [...links].map(([url, title]) =>
          inspectProduct(config.store, url, title),
        ),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          products.push(result.value);
        } else {
          errors.push(`${config.store}: ${String(result.reason)}`);
        }
      }
    } catch (error) {
      errors.push(`${config.store}: ${String(error)}`);
    }
  }

  return {
    products,
    errors,
  };
}

export const filterDescription =
  "Pokémon 30th ETB, Booster Box/Display, Booster Bundle, or UPC";

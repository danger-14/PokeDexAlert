import * as cheerio from "cheerio";
import { isWanted30thProduct, normalizeText } from "./productTerms";
import type { ProductHit, StockStatus, StoreKey } from "./types";

export function absoluteUrl(base: string, href: string) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

export function compactText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export function extractPrice(text: string) {
  const matches = text.match(/\b\d{1,4}(?:[.,]\d{2})?\s*€/g);
  return matches?.[0]?.replace(".", ",");
}

export function extractLimit(text: string) {
  const m = text.match(/(?:max(?:\.|imum)?\s*)?(\d+)\s*(?:kpl\s*)?(?:\/|per\s+)(?:asiakas|customer)|ostorajoitus\s*(\d+)\s*kpl/i);
  const n = m?.[1] || m?.[2];
  return n ? `${n} kpl / asiakas` : undefined;
}

export function statusFromText(text: string): StockStatus {
  const t = normalizeText(text);
  const unavailable = ["loppuunmyyty", "varasto loppu", "ei varastossa", "sold out", "out of stock", "ei saatavilla"];
  if (unavailable.some((x) => t.includes(x))) return "out_of_stock";
  const available = ["lisää ostoskoriin", "osta nyt", "varastossa", "in stock", "saatavilla", "toimitus saatavilla"];
  if (available.some((x) => t.includes(x))) return "available";
  return "unknown";
}

export function discoverLinks(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const found = new Map<string, string>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const text = compactText($(element).text());
    if (!href || !text || !isWanted30thProduct(text)) return;
    const url = absoluteUrl(baseUrl, href);
    found.set(url, text);
  });
  return [...found.entries()].map(([url, name]) => ({ url, name }));
}

export function parseGenericProductPage(args: {
  html: string;
  url: string;
  fallbackName: string;
  store: StoreKey;
  storeName: string;
}): ProductHit {
  const { html, url, fallbackName, store, storeName } = args;
  const $ = cheerio.load(html);
  const name = compactText($("h1").first().text()) || fallbackName;
  const body = compactText($("body").text());
  const canonical = $("link[rel='canonical']").attr("href") || url;
  return {
    id: `${store}:${canonical}`,
    store,
    storeName,
    name,
    url: canonical,
    price: extractPrice(body),
    purchaseLimit: extractLimit(body),
    availabilityText: body.slice(0, 1200),
    status: statusFromText(body),
  };
}

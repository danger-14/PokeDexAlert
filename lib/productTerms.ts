const PRODUCT_ALIASES: Record<string, string[]> = {
  etb: [
    "elite trainer box",
    "elite training box",
    "trainer box",
  ],

  upc: [
    "ultra premium collection",
    "ultra-premium collection",
    "ultra premium box",
  ],

  bb: [
    "booster box",
    "booster display",
    "display box",
  ],

  boosterbox: [
    "booster box",
    "booster display",
    "display",
  ],

  boosterbundle: [
    "booster bundle",
    "bundle",
  ],

  pcetb: [
    "pokemon center elite trainer box",
    "pokemon center etb",
  ],

  collectionbox: [
    "collection box",
    "collection",
  ],

  blister: [
    "blister",
    "blister pack",
  ],

  tin: [
    "tin",
    "collector tin",
    "collection tin",
  ],
};

const PHRASE_EQUIVALENTS: Array<[RegExp, string]> = [
  [
    /\belite\s+training\s+box\b/gi,
    "elite trainer box",
  ],
  [
    /\bultra[\s-]+premium\s+collection\b/gi,
    "ultra premium collection",
  ],
  [
    /\bbooster\s+display\b/gi,
    "booster box",
  ],
  [
    /\bdisplay\s+box\b/gi,
    "booster box",
  ],
  [
    /\b30th\s+anniversary\b/gi,
    "30th celebration",
  ],
  [
    /\b30\s*th\s+anniversary\b/gi,
    "30th celebration",
  ],
];

export function normalizeProductText(value: string) {
  let normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const [pattern, replacement] of PHRASE_EQUIVALENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(" ");

  const expanded: string[] = [];

  for (const word of words) {
    expanded.push(word);

    const aliases = PRODUCT_ALIASES[word];

    if (aliases) {
      for (const alias of aliases) {
        expanded.push(alias);
      }
    }
  }

  return [...new Set(expanded.join(" ").split(/\s+/))]
    .join(" ");
}

export function productTokens(value: string) {
  const ignored = new Set([
    "pokemon",
    "tcg",
    "the",
    "and",
    "with",
    "for",
    "product",
    "tuote",
    "box",
  ]);

  return normalizeProductText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 2 &&
        !ignored.has(token),
    );
}

export function productMatchScore(
  candidate: string,
  wanted: string,
) {
  const candidateNormalized =
    normalizeProductText(candidate);

  const wantedNormalized =
    normalizeProductText(wanted);

  if (
    candidateNormalized.includes(wantedNormalized) ||
    wantedNormalized.includes(candidateNormalized)
  ) {
    return 100;
  }

  const wantedTokens = productTokens(wanted);
  const candidateTokens = new Set(
    productTokens(candidate),
  );

  if (wantedTokens.length === 0) {
    return 0;
  }

  let matched = 0;

  for (const token of wantedTokens) {
    if (candidateTokens.has(token)) {
      matched += 1;
    }
  }

  return Math.round(
    (matched / wantedTokens.length) * 100,
  );
}

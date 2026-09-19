import { KNOWN_PRODUCT_IDENTITIES } from "./productCatalog";
import type { ProductIdentity, ProductType } from "./types";

const GENERIC_WORDS = new Set([
  "pokemon",
  "tcg",
  "card",
  "cards",
  "trading",
  "game",
  "the",
  "and",
  "with",
  "for",
  "product",
  "collection",
  "english",
  "eng",
  "en",
  "kerailykortit",
  "kerailykortti",
  "erilaisia",
]);

function normalizeCharacters(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function basicNormalize(value: string) {
  return normalizeCharacters(value)
    .replace(/30\s*th\s+anniversary/g, "30th celebration")
    .replace(/30th\s+anniversary/g, "30th celebration")
    .replace(/elite\s+training\s+box/g, "elite trainer box")
    .replace(/ultra[\s-]+premium\s+collection/g, "ultra premium collection")
    .replace(/booster\s+display/g, "booster box")
    .replace(/display\s+box/g, "booster box")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectEan(value: string) {
  const direct = value.match(/\b\d{12,14}\b/);
  return direct?.[0] || null;
}

export function detectSetCode(value: string) {
  const text = value.toUpperCase();

  const match = text.match(
    /\b(?:ME|SV|SWSH|SM|XY)\d+(?:\.\d+)?\b/,
  );

  return match?.[0] || null;
}

export function detectProductType(value: string): ProductType {
  const text = basicNormalize(value);

  if (
    /\betb\b/.test(text) ||
    /\belite trainer(?: box)?\b/.test(text)
  ) {
    return "etb";
  }

  if (
    /\bupc\b/.test(text) ||
    /\bultra premium collection\b/.test(text)
  ) {
    return "upc";
  }

  if (/\bbooster bundle\b/.test(text)) return "booster_bundle";

  if (/\bbb\b/.test(text) || /\bbooster box\b/.test(text)) {
    return "booster_box";
  }

  if (/\bbinder\b/.test(text)) return "binder";
  if (/\bposter\b/.test(text)) return "poster";
  if (/\bblister\b/.test(text)) return "blister";
  if (/\btin\b/.test(text)) return "tin";
  if (/\bcollection box\b/.test(text)) return "collection_box";

  return null;
}

function canonicalProductType(type: ProductType) {
  switch (type) {
    case "etb":
      return "elite trainer box";
    case "upc":
      return "ultra premium collection";
    case "booster_box":
      return "booster box";
    case "booster_bundle":
      return "booster bundle";
    case "binder":
      return "binder collection";
    case "poster":
      return "poster collection";
    case "blister":
      return "blister";
    case "tin":
      return "tin";
    case "collection_box":
      return "collection box";
    default:
      return "";
  }
}

export function normalizeProductText(value: string) {
  let normalized = basicNormalize(value)
    .replace(/\betb\b/g, "elite trainer box")
    .replace(/\bupc\b/g, "ultra premium collection")
    .replace(/\bbb\b/g, "booster box");

  const type = detectProductType(value);
  const canonical = canonicalProductType(type);

  if (canonical && !normalized.includes(canonical)) {
    normalized = `${normalized} ${canonical}`;
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function significantTokens(value: string) {
  return normalizeProductText(value)
    .split(" ")
    .filter(
      (token) => token.length >= 2 && !GENERIC_WORDS.has(token),
    );
}

function aliasScore(value: string, identity: ProductIdentity) {
  const normalized = normalizeProductText(value);
  const valueType = detectProductType(value);
  const valueSet = detectSetCode(value);

  if (
    valueType &&
    identity.productType &&
    valueType !== identity.productType
  ) {
    return 0;
  }

  if (
    valueSet &&
    identity.setCode &&
    valueSet !== identity.setCode
  ) {
    return 0;
  }

  let score = 0;

  const candidates = [identity.canonicalName, ...identity.aliases];

  for (const candidate of candidates) {
    const candidateNormalized = normalizeProductText(candidate);

    if (candidateNormalized === normalized) return 100;

    if (
      candidateNormalized.includes(normalized) ||
      normalized.includes(candidateNormalized)
    ) {
      score = Math.max(score, 92);
    }
  }

  if (valueSet && identity.setCode === valueSet) score += 45;
  if (valueType && identity.productType === valueType) score += 30;

  const wantedTokens = significantTokens(value);
  const identityTokens = new Set(
    significantTokens(
      [identity.canonicalName, ...identity.aliases].join(" "),
    ),
  );

  if (wantedTokens.length > 0) {
    const matches = wantedTokens.filter((token) =>
      identityTokens.has(token),
    ).length;

    score += Math.round((matches / wantedTokens.length) * 25);
  }

  return Math.min(score, 100);
}

export function resolveProductIdentity(
  value: string,
): ProductIdentity | null {
  const wanted = value.trim();

  if (!wanted) return null;

  const explicitEan = detectEan(wanted);

  if (explicitEan) {
    const known = KNOWN_PRODUCT_IDENTITIES.find(
      (identity) => identity.ean === explicitEan,
    );

    if (known) return known;

    const nameWithoutEan = wanted
      .replace(explicitEan, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      key: `ean-${explicitEan}`,
      canonicalName: nameWithoutEan || explicitEan,
      aliases: [wanted, nameWithoutEan].filter(Boolean),
      productType: detectProductType(wanted),
      ean: explicitEan,
      setCode: detectSetCode(wanted) || undefined,
    };
  }

  const ranked = KNOWN_PRODUCT_IDENTITIES
    .map((identity) => ({
      identity,
      score: aliasScore(wanted, identity),
    }))
    .sort((a, b) => b.score - a.score);

  if (ranked[0] && ranked[0].score >= 70) {
    return ranked[0].identity;
  }

  return null;
}

export function productMatchScore(
  candidate: string,
  wanted: string,
  identity: ProductIdentity | null = resolveProductIdentity(wanted),
) {
  const candidateNormalized = normalizeProductText(candidate);
  const wantedNormalized = normalizeProductText(wanted);

  const candidateType = detectProductType(candidate);
  const wantedType = identity?.productType || detectProductType(wanted);

  const candidateSet = detectSetCode(candidate);
  const wantedSet = identity?.setCode || detectSetCode(wanted);

  if (
    wantedType &&
    candidateType &&
    wantedType !== candidateType
  ) {
    return 0;
  }

  if (
    wantedSet &&
    candidateSet &&
    wantedSet !== candidateSet
  ) {
    return 0;
  }

  if (candidateNormalized === wantedNormalized) return 100;

  if (
    candidateNormalized.includes(wantedNormalized) ||
    wantedNormalized.includes(candidateNormalized)
  ) {
    return 96;
  }

  let score = 0;

  if (identity) {
    for (const alias of [identity.canonicalName, ...identity.aliases]) {
      const normalizedAlias = normalizeProductText(alias);

      if (
        candidateNormalized === normalizedAlias ||
        candidateNormalized.includes(normalizedAlias) ||
        normalizedAlias.includes(candidateNormalized)
      ) {
        score = Math.max(score, 92);
      }
    }
  }

  if (wantedSet && candidateSet === wantedSet) score += 50;
  if (wantedType && candidateType === wantedType) score += 35;

  const wantedTokens = significantTokens(wanted);
  const candidateTokens = new Set(significantTokens(candidate));

  const ignored = new Set([
    wantedSet?.toLowerCase() || "",
    candidateSet?.toLowerCase() || "",
    "elite",
    "trainer",
    "box",
    "ultra",
    "premium",
    "collection",
    "booster",
    "bundle",
    "binder",
    "poster",
    "blister",
    "tin",
  ]);

  const comparisonTokens = wantedTokens.filter(
    (token) => !ignored.has(token),
  );

  if (comparisonTokens.length > 0) {
    const matches = comparisonTokens.filter((token) =>
      candidateTokens.has(token),
    ).length;

    score += Math.round((matches / comparisonTokens.length) * 15);
  }

  if (wantedSet && !candidateSet) score = Math.min(score, 60);

  return Math.min(score, 100);
}

export function productSearchVariants(
  value: string,
  identity: ProductIdentity | null = resolveProductIdentity(value),
) {
  const variants = new Set<string>();
  const wanted = value.trim();

  if (identity?.ean) variants.add(identity.ean);
  if (wanted) variants.add(wanted);

  if (identity) {
    for (const alias of identity.aliases) variants.add(alias);

    if (identity.setCode) {
      const typeText = canonicalProductType(identity.productType);

      if (typeText) {
        variants.add(`${identity.setCode} ${typeText}`);
      }

      if (identity.productType === "etb") {
        variants.add(`${identity.setCode} Elite Trainer`);
        variants.add(`${identity.setCode} Elite Trainer Box`);
      }
    }
  }

  return [...variants].filter(Boolean);
}

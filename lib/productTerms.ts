type ProductType =
  | "etb"
  | "upc"
  | "booster_box"
  | "booster_bundle"
  | "binder"
  | "poster"
  | "blister"
  | "tin"
  | "collection_box"
  | null;

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
  "box",
  "english",
  "eng",
  "en",
]);

function basicNormalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/30\s*th\s+anniversary/g, "30th celebration")
    .replace(/30th\s+anniversary/g, "30th celebration")
    .replace(/elite\s+training\s+box/g, "elite trainer box")
    .replace(/ultra[\s-]+premium\s+collection/g, "ultra premium collection")
    .replace(/booster\s+display/g, "booster box")
    .replace(/display\s+box/g, "booster box")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectProductType(
  value: string,
): ProductType {
  const text = basicNormalize(value);

  if (
    /\betb\b/.test(text) ||
    /\belite trainer box\b/.test(text)
  ) {
    return "etb";
  }

  if (
    /\bupc\b/.test(text) ||
    /\bultra premium collection\b/.test(text)
  ) {
    return "upc";
  }

  if (
    /\bbooster bundle\b/.test(text)
  ) {
    return "booster_bundle";
  }

  if (
    /\bbb\b/.test(text) ||
    /\bbooster box\b/.test(text)
  ) {
    return "booster_box";
  }

  if (
    /\bbinder\b/.test(text) ||
    /\bbinder collection\b/.test(text)
  ) {
    return "binder";
  }

  if (
    /\bposter\b/.test(text) ||
    /\bposter collection\b/.test(text)
  ) {
    return "poster";
  }

  if (
    /\bblister\b/.test(text)
  ) {
    return "blister";
  }

  if (
    /\btin\b/.test(text)
  ) {
    return "tin";
  }

  if (
    /\bcollection box\b/.test(text)
  ) {
    return "collection_box";
  }

  return null;
}

function canonicalProductType(
  type: ProductType,
) {
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

export function normalizeProductText(
  value: string,
) {
  let normalized =
    basicNormalize(value);

  const type =
    detectProductType(value);

  /*
   * Replace common abbreviations with their
   * canonical product type.
   */

  normalized = normalized
    .replace(/\betb\b/g, "elite trainer box")
    .replace(/\bupc\b/g, "ultra premium collection")
    .replace(/\bbb\b/g, "booster box");

  if (type) {
    const canonical =
      canonicalProductType(type);

    if (
      canonical &&
      !normalized.includes(canonical)
    ) {
      normalized =
        `${normalized} ${canonical}`;
    }
  }

  return normalized
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(
  value: string,
) {
  return normalizeProductText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 2 &&
        !GENERIC_WORDS.has(token),
    );
}

/**
 * Product type is intentionally weighted heavily.
 *
 * Example:
 *
 * Wanted:
 *   30th Anniversary UPC
 *
 * Candidate:
 *   30th Celebration Elite Trainer Box
 *
 * These share "30th Celebration", but the product
 * types are different, so they must NOT be treated
 * as a strong match.
 */
export function productMatchScore(
  candidate: string,
  wanted: string,
) {
  const candidateNormalized =
    normalizeProductText(candidate);

  const wantedNormalized =
    normalizeProductText(wanted);

  const wantedType =
    detectProductType(wanted);

  const candidateType =
    detectProductType(candidate);

  /*
   * Strong rejection when both sides identify
   * different product types.
   */
  if (
    wantedType &&
    candidateType &&
    wantedType !== candidateType
  ) {
    return 10;
  }

  if (
    candidateNormalized ===
    wantedNormalized
  ) {
    return 100;
  }

  /*
   * Exact canonical phrase contained in the
   * candidate title.
   */
  if (
    candidateNormalized.includes(
      wantedNormalized,
    )
  ) {
    return 100;
  }

  const wantedTokens =
    significantTokens(wanted);

  const candidateTokens =
    new Set(
      significantTokens(candidate),
    );

  if (
    wantedTokens.length === 0
  ) {
    return 0;
  }

  let matches = 0;

  for (const token of wantedTokens) {
    if (
      candidateTokens.has(token)
    ) {
      matches += 1;
    }
  }

  let score =
    Math.round(
      (matches /
        wantedTokens.length) *
        70,
    );

  /*
   * Same known product type is a very
   * strong positive signal.
   */
  if (
    wantedType &&
    candidateType === wantedType
  ) {
    score += 30;
  }

  /*
   * User specified ETB / UPC etc., but candidate
   * title doesn't clearly identify any product type.
   * Don't give it full confidence.
   */
  if (
    wantedType &&
    !candidateType
  ) {
    score = Math.min(
      score,
      60,
    );
  }

  return Math.min(
    score,
    100,
  );
}

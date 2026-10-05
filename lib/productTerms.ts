const anniversaryTerms = [
  "30th celebration",
  "30th anniversary",
  "30th",
];

const wantedTerms = [
  "elite trainer box",
  "etb",
  "booster box",
  "booster display",
  "booster bundle",
  "bst bundle",
  "ultra premium",
  "ultra-premium",
  "premium collection day",
  "premium collection night",
  "upc",
];

const rejectedTerms = [
  "blister",
  "poster",
  "binder",
  "mini tin",
  "mini tins",
  "tin ex",
  "battle deck",
  "tech sticker",
  "figure collection",
  "box ex",
  "ditto premium",
];

export function normalizeText(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isWanted30thProduct(name: string) {
  const text = normalizeText(name);

  // TEMPORARY ALERT TEST PRODUCT.
  // Remove this block after the notification test succeeds.
  const isMe04TestProduct =
    text.includes("me04") &&
    (text.includes("elite trainer") ||
      text.includes("etb") ||
      text.includes("chaos rising"));

  if (isMe04TestProduct) return true;

  const anniversary = anniversaryTerms.some((term) =>
    text.includes(term)
  );

  const wanted = wantedTerms.some((term) =>
    text.includes(term)
  );

  const rejected = rejectedTerms.some((term) =>
    text.includes(term)
  );

  return anniversary && wanted && !rejected;
}

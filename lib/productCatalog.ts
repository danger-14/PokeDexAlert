import type { ProductIdentity } from "./types";

/**
 * Canonical Pokémon product identities.
 *
 * The store scanner uses EAN/GTIN as the strongest identity when known.
 * Marketing names and store-specific titles are treated as aliases.
 *
 * For a future release you have two options:
 * 1. add one object here once the EAN is known, or
 * 2. enter the EAN directly in the monitor name, for example:
 *    "Future Set ETB 0196214XXXXXX"
 */
export const KNOWN_PRODUCT_IDENTITIES: ProductIdentity[] = [
  {
    key: "pokemon-30th-etb",
    canonicalName: "Pokémon 30th Anniversary Elite Trainer Box",
    productType: "etb",
    ean: "0196214144828",
    setCode: "30TH",
    aliases: [
      "30th ETB",
      "30th Anniversary ETB",
      "30th Celebration ETB",
      "Pokemon 30th ETB",
      "Pokemon 30th Anniversary Elite Trainer Box",
      "Pokemon 30th Celebration Elite Trainer Box",
      "Elite Trainer Box 30th",
    ],
  },
  {
    key: "pokemon-me03-perfect-order-etb",
    canonicalName: "Pokémon TCG ME03 Perfect Order Elite Trainer Box",
    productType: "etb",
    ean: "0196214136373",
    setCode: "ME03",
    aliases: [
      "Perfect Order ETB",
      "ME03 ETB",
      "ME03 Elite Trainer Box",
      "Perfect Order Elite Trainer Box",
      "Pokemon TCG ME03 Elite Trainer Box",
    ],
    storeRefs: {
      prisma: {
        productId: "111268552",
        productUrl:
          "https://www.prisma.fi/tuotteet/111268552/pokemon-tcg-kerailykortit-me03-elite-trainer-box-erilaisia-111268552",
      },
    },
  },
  {
    key: "pokemon-me04-chaos-rising-etb",
    canonicalName: "Pokémon TCG ME04 Chaos Rising Elite Trainer Box",
    productType: "etb",
    ean: "0196214139954",
    setCode: "ME04",
    aliases: [
      "Chaos Rising ETB",
      "ME04 ETB",
      "ME04 Elite Trainer",
      "ME04 Elite Trainer Box",
      "Chaos Rising Elite Trainer Box",
      "Pokemon TCG ME04 Elite Trainer",
    ],
    storeRefs: {
      prisma: {
        productId: "111268541",
        productUrl:
          "https://www.prisma.fi/tuotteet/111268541/pokemon-tcg-kerailykortit-me04-elite-trainer-111268541",
      },
    },
  },
  {
    key: "pokemon-me05-pitch-black-etb",
    canonicalName: "Pokémon TCG ME05 Pitch Black Elite Trainer Box",
    productType: "etb",
    ean: "0196214142138",
    setCode: "ME05",
    aliases: [
      "Pitch Black ETB",
      "ME05 ETB",
      "ME05 Elite Trainer Box",
      "Pitch Black Elite Trainer Box",
      "Pokemon TCG ME05 Pitch Black Elite Trainer Box",
      "Poke ME05 Elite Trainer Box",
    ],
    storeRefs: {
      prisma: {
        productId: "111354660",
        productUrl:
          "https://www.prisma.fi/tuotteet/111354660/pokemon-tcg-me05-pitch-black-elite-trainer-box-111354660",
      },
    },
  },
];

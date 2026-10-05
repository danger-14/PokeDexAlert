export type StockStatus = "available" | "out_of_stock" | "unknown";

export type StoreKey = "pokepulls" | "tcgkauppa" | "swagykarp" | "prisma";

export type ProductHit = {
  id: string;
  store: StoreKey;
  storeName: string;
  name: string;
  url: string;
  price?: string;
  purchaseLimit?: string;
  availabilityText?: string;
  location?: string;
  status: StockStatus;
};

export type StoreScanResult = {
  store: StoreKey;
  storeName: string;
  ok: boolean;
  products: ProductHit[];
  error?: string;
};

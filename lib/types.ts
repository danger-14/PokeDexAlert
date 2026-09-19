export type AvailabilityState =
  | "in_stock"
  | "preorder"
  | "coming_soon"
  | "fully_booked"
  | "out_of_stock"
  | "watch_only"
  | "unknown";

export type ProductType =
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

export type StoreReference = {
  productId?: string;
  productUrl?: string;
};

export type ProductIdentity = {
  key: string;
  canonicalName: string;
  aliases: string[];
  productType: ProductType;
  ean?: string;
  setCode?: string;
  storeRefs?: Record<string, StoreReference>;
};

export type Product = {
  monitorId?: string;
  identityKey?: string;
  storeProductId?: string;
  ean?: string;
  store: string;
  title: string;
  url: string;
  price?: string;
  sku?: string;
  stockText?: string;
  statusText?: string;
  state: AvailabilityState;
  available: boolean;
  evidence: string[];
};

export type StoredProduct = {
  monitor_id: string;
  product_url: string | null;
  available: boolean;
  last_title: string | null;
  last_store: string | null;
};

export type MonitoredStore = {
  id: string;
  name: string;
  product_name: string | null;
  listing_url: string;
  enabled: boolean;
  created_at: string;
};

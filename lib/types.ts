export type AvailabilityState =
  | "in_stock"
  | "preorder"
  | "coming_soon"
  | "fully_booked"
  | "out_of_stock"
  | "watch_only"
  | "unknown";

export type Product = {
  store: string;
  title: string;
  url: string;
  price?: string;
  sku?: string;
  stockText?: string;
  state: AvailabilityState;
  available: boolean;
  evidence: string[];
};

export type StoredProduct = {
  product_url: string;
  available: boolean;
  last_title: string | null;
  last_store: string | null;
};

// Each row now represents one specific product monitor.
export type MonitoredStore = {
  id: string;
  name: string;
  product_name: string | null;
  listing_url: string;
  enabled: boolean;
  created_at: string;
};

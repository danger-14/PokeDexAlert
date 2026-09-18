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

  /**
   * Raw availability / stock wording found on the store.
   * Example:
   * "5+ jäljellä varastossa"
   */
  stockText?: string;

  /**
   * Store's visible status wording if found.
   * Example:
   * "Tulossa pian"
   * "Fully booked"
   * "Loppuunmyyty"
   */
  statusText?: string;

  state: AvailabilityState;

  /**
   * TRUE only when PokeDexAlert believes the
   * product can genuinely be ordered.
   */
  available: boolean;

  evidence: string[];
};

export type StoredProduct = {
  product_url: string;
  available: boolean;
  last_title: string | null;
  last_store: string | null;
};

/**
 * One database row = one monitored product.
 *
 * Multiple rows can use the same store name,
 * allowing one store to contain many products.
 */
export type MonitoredStore = {
  id: string;

  /**
   * Parent store name.
   * Example: MaxGaming
   */
  name: string;

  /**
   * User-friendly product search name.
   * Example: 30th Anniversary ETB
   */
  product_name: string | null;

  /**
   * Exact product URL is preferred.
   * Store/category/search pages are also supported.
   */
  listing_url: string;

  enabled: boolean;

  created_at: string;
};

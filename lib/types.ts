export type Product = {
  store: string;
  title: string;
  url: string;
  price?: string;
  available: boolean;
};

export type StoredProduct = {
  product_url: string;
  available: boolean;
  last_title: string | null;
  last_store: string | null;
};

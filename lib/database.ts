import { createClient } from "@supabase/supabase-js";
import type { ProductHit, StockStatus } from "./types";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type StateRow = {
  product_id: string;
  store: string;
  name: string;
  url: string;
  last_status: StockStatus;
  last_price: string | null;
  last_seen_at: string;
  last_alerted_at: string | null;
};

export async function getState(productId: string): Promise<StateRow | null> {
  const { data, error } = await client().from("stock_alert_state").select("*").eq("product_id", productId).maybeSingle();
  if (error) throw error;
  return data as StateRow | null;
}

export async function saveState(hit: ProductHit, alerted: boolean) {
  const now = new Date().toISOString();
  const { error } = await client().from("stock_alert_state").upsert({
    product_id: hit.id,
    store: hit.store,
    name: hit.name,
    url: hit.url,
    last_status: hit.status,
    last_price: hit.price || null,
    last_seen_at: now,
    ...(alerted ? { last_alerted_at: now } : {}),
  }, { onConflict: "product_id" });
  if (error) throw error;
}

export async function recentState(limit = 100) {
  const { data, error } = await client().from("stock_alert_state").select("*").order("last_seen_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []) as StateRow[];
}

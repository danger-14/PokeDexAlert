create table if not exists public.stock_alert_state (
  product_url text primary key,
  available boolean not null default false,
  last_title text,
  last_store text,
  last_seen_at timestamptz not null default now(),
  last_alerted_at timestamptz
);

alter table public.stock_alert_state
enable row level security;

-- PokeDexAlert uses the server-side Supabase service-role key.
-- Never expose that key in browser code or commit it to GitHub.

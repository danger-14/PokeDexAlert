create table if not exists public.stock_alert_state (
  product_id text primary key,
  store text not null,
  name text not null,
  url text not null,
  last_status text not null check (last_status in ('available','out_of_stock','unknown')),
  last_price text,
  last_seen_at timestamptz not null default now(),
  last_alerted_at timestamptz
);

create index if not exists stock_alert_state_last_seen_idx
  on public.stock_alert_state (last_seen_at desc);

alter table public.stock_alert_state enable row level security;
-- The app uses the Supabase service-role key server-side, so no public RLS policy is required.

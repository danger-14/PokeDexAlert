-- =====================================================
-- PokeDexAlert product identity / alert state migration
-- =====================================================

-- Product name is required by the current store-first UI.
alter table public.monitored_stores
add column if not exists product_name text;

-- Multiple monitored products are allowed to share one discovery URL.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.monitored_stores'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%listing_url%'
  loop
    execute format(
      'alter table public.monitored_stores drop constraint %I',
      r.conname
    );
  end loop;
end $$;

drop index if exists public.monitored_stores_listing_url_key;

create index if not exists monitored_stores_name_idx
on public.monitored_stores(name);

-- -----------------------------------------------------
-- New alert-state table.
--
-- The old stock_alert_state used product_url as identity.
-- That is unsafe when several monitors share a source URL.
-- Each monitor now has its own independent state row.
-- -----------------------------------------------------

create table if not exists public.monitor_alert_state (
  monitor_id uuid primary key
    references public.monitored_stores(id)
    on delete cascade,

  product_url text,
  available boolean not null default false,
  last_title text,
  last_store text,
  last_seen_at timestamptz,
  last_alerted_at timestamptz
);

create index if not exists monitor_alert_state_available_idx
on public.monitor_alert_state(available);

-- The legacy stock_alert_state table can remain in place.
-- The new application code no longer reads or writes it.

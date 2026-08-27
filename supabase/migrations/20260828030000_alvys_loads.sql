-- Alvys Loads sync support (Operations Dashboard: Empty Mile %, On-Time
-- Pickup, On-Time Delivery). Alvys's loads/search endpoint has no
-- date-range filter — only Status/PONumbers/CustomerId/LoadNumbers/
-- OrderNumbers/UpdatedBy/CustomerSalesAgentId — so we sync loads into our
-- own table and compute weekly KPIs from local data with fast date
-- filters, instead of re-pulling from Alvys on every dashboard render.

create table alvys_loads (
  id uuid primary key default gen_random_uuid(),
  alvys_load_id text not null unique,
  load_number text,
  customer_name text,
  status text not null,
  loaded_miles numeric,
  linehaul_amount numeric,
  customer_rate_amount numeric,

  scheduled_pickup_at timestamptz,
  scheduled_delivery_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,

  -- Flattened from the first Pickup-type / last Delivery-type stop, so
  -- on-time computation doesn't need to walk the stops jsonb per row.
  pickup_schedule_type text,
  pickup_window_end timestamptz,
  pickup_appointment_at timestamptz,
  pickup_arrived_at timestamptz,
  delivery_schedule_type text,
  delivery_window_end timestamptz,
  delivery_appointment_at timestamptz,
  delivery_arrived_at timestamptz,

  stops jsonb,
  alvys_created_at timestamptz,
  alvys_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index alvys_loads_scheduled_pickup_idx on alvys_loads (scheduled_pickup_at);
create index alvys_loads_scheduled_delivery_idx on alvys_loads (scheduled_delivery_at);
create index alvys_loads_status_idx on alvys_loads (status);

alter table alvys_loads enable row level security;
create policy "authenticated_all_alvys_loads" on alvys_loads for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Fleet Maintenance System — Asset Lifecycle / Disposal decision support
--
-- Implements Asset_Lifecycle_Disposal_Spec.md's Phase 1: the data model
-- behind a buy/sell (disposal or replacement) decision signal per unit,
-- surfaced as a tile in the Spend page's per-unit drill-down -- the spec's
-- own explicit phase-one interface (§7), with a standalone fleet-wide
-- exception report as the deferred phase-two destination. The schema below
-- is shaped so that later page can be built without a redesign: every field
-- the fleet-wide report needs (§6) is already queryable per unit here.
--
-- Several inputs the spec calls out as still undecided ([OPEN] items, §9)
-- are deliberately left unset/nullable below rather than filled with a
-- guessed number -- same convention as shop_labor_rate's "0 reads as not
-- configured yet" rule (20260901050000_shop_labor_rate.sql). Two items are
-- left out of this migration entirely rather than half-built: an aggregate
-- self-built market trendline (spec §4.4) and the cumulative $/mile trend
-- trigger (spec §5, item 3) -- the trend trigger needs a historical mileage
-- time series this schema doesn't capture anywhere yet, so a threshold
-- column with no real consumer would be misleading busywork, not progress.
-- Both stay explicitly open for a follow-up conversation, per the spec.

-- ---------------------------------------------------------------------------
-- units — when a unit entered CLG's fleet, for the age half of the target
-- exit band (mileage OR age, whichever comes first — spec §2). Nullable
-- with a documented fallback to model year in the app when it's not on
-- file, same "manual-entry fallback" convention as every other
-- Alvys-sourced field on this table.
-- ---------------------------------------------------------------------------

alter table units add column if not exists in_service_date date;

-- ---------------------------------------------------------------------------
-- work_orders — warranty claim status per invoice (spec §5.1: a
-- target-window unit is expected to be under warranty, so a large or
-- category-matched invoice is anomalous, not expected — the claim outcome
-- is what tells the two apart). Defaults to 'n_a' rather than 'not_filed':
-- most work orders were never warranty-eligible to begin with (routine PM,
-- wear items), so defaulting to "not filed" would misrepresent them as
-- missed claims instead of not-applicable ones.
-- ---------------------------------------------------------------------------

create type warranty_claim_status as enum ('covered', 'denied', 'not_filed', 'n_a');

alter table work_orders add column if not exists warranty_claim_status warranty_claim_status not null default 'n_a';

-- ---------------------------------------------------------------------------
-- asset_market_comps — manual comparable-listing entries per unit (spec
-- §4.1, TruckPaper and similar). The estimated market value and the
-- mileage-adjustment factor are computed client-side by regressing price
-- against mileage across each unit's own comp set at read time (spec §4.2:
-- "derived from the comp set itself... self-corrects with each refresh, no
-- separate assumption to maintain over time") — so there's no separate
-- valuation row to keep in sync with the comps it came from.
-- ---------------------------------------------------------------------------

create table if not exists asset_market_comps (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  source text not null,
  pulled_at date not null default current_date,
  comp_year integer,
  comp_make text,
  comp_model text,
  comp_engine text,
  comp_mileage integer not null,
  comp_asking_price numeric(10, 2) not null,
  entered_by text, -- display name/email; not a hard FK, same as work_order_activity.actor
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_market_comps_unit_id on asset_market_comps(unit_id);

alter table asset_market_comps enable row level security;
create policy "authenticated_all_asset_market_comps" on asset_market_comps
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- app_settings — Asset Lifecycle config (spec §2: "a configurable input,
-- not a fixed rule" — may vary by spec/duty cycle later, one universal
-- default for now per spec §9 item 4). asset_single_invoice_threshold stays
-- null until CLG supplies a starting figure from its own repair history
-- (spec §5, item 2) — null means the single-invoice trigger simply doesn't
-- fire yet, not a silently-guessed dollar amount standing in for one.
-- ---------------------------------------------------------------------------

alter table app_settings add column if not exists asset_target_miles integer not null default 250000;
alter table app_settings add column if not exists asset_target_age_years numeric(4, 1) not null default 2;
alter table app_settings add column if not exists asset_single_invoice_threshold numeric(10, 2);
alter table app_settings add column if not exists asset_reliability_categories wo_category[] not null default array['Engine', 'Transmission']::wo_category[];

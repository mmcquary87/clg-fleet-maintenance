-- Fleet Maintenance System — planning loads: open loads vs. history
--
-- planning_loads_v (20261111010000) was documented as "open loads" but
-- only excluded Delivered/Cancelled/Voided. Alvys loads in CLGOS carry
-- status 'Completed' (10,439 rows) and 'Delivered' (49) and nothing else:
-- alvys-sync-loads is manual-only, was last run in late August, and the
-- newest pickup in alvys_loads is 2026-08-27. So the "open" view was
-- returning ten thousand historic loads, and there are in fact NO open or
-- booked loads in CLGOS at all.
--
-- planning_loads_v now means what it says (anything not Completed/
-- Delivered/Cancelled/Voided -- currently zero rows, which is the truth
-- until the loads sync is scheduled and pulls booked/dispatched loads).
-- planning_load_history_v is the completed-load history (last 365 days)
-- for rate/customer benchmarking, which is valid regardless of how stale
-- the sync is. Same in-view role gate as the other planning_*_v views.

create or replace view planning_loads_v as
select
  al.alvys_load_id, al.load_number, al.customer_name, al.status, al.loaded_miles,
  al.linehaul_amount, al.customer_rate_amount, al.stops,
  al.scheduled_pickup_at, al.scheduled_delivery_at, al.pickup_window_end, al.pickup_appointment_at,
  al.delivery_window_end, al.delivery_appointment_at, al.picked_up_at, al.delivered_at, al.synced_at
from alvys_loads al
where al.status not in ('Completed', 'Delivered', 'Cancelled', 'Voided')
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('planning_agent', 'admin'));

create or replace view planning_load_history_v as
select
  al.alvys_load_id, al.load_number, al.customer_name, al.status, al.loaded_miles,
  al.linehaul_amount, al.customer_rate_amount,
  al.scheduled_pickup_at, al.scheduled_delivery_at, al.pickup_window_end, al.pickup_appointment_at,
  al.delivery_window_end, al.delivery_appointment_at, al.picked_up_at, al.delivered_at
from alvys_loads al
where al.status in ('Completed', 'Delivered')
  and al.scheduled_pickup_at >= now() - interval '365 days'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('planning_agent', 'admin'));

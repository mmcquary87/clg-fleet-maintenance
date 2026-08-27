-- Fleet Maintenance System — structured vendor contact info.
-- The existing `contact` free-text field stays (phone/notes); these add a
-- named contact and email so the app can pre-fill an "email the shop" draft.

alter table vendors add column if not exists contact_name text;
alter table vendors add column if not exists contact_email text;

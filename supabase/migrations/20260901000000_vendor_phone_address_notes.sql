-- Fleet Maintenance System — richer vendor contact info
--
-- vendors previously only had a single free-text "contact" column doing
-- double duty as phone number / misc notes, plus contact_name/contact_email
-- from an earlier migration. Splits phone and free-form notes into their
-- own columns and adds an address, so the vendor edit form (added
-- alongside this migration) has a dedicated field for each. The old
-- "contact" column is left in place, unused by new writes, so existing
-- free-text data isn't lost — the UI falls back to it when phone is blank.

alter table vendors add column if not exists phone text;
alter table vendors add column if not exists address text;
alter table vendors add column if not exists notes text;

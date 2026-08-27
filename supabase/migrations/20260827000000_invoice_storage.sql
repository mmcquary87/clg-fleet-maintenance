-- Fleet Maintenance System — invoice/receipt file storage
-- Run this in the Supabase SQL Editor after 20260826130000_auth_profiles.sql.

-- A place to store receipt/invoice files, plus a column on work_orders so
-- each one can point back at its source file. Private bucket — only
-- logged-in users can read/write, same as the data tables.

alter table work_orders add column receipt_path text;

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "authenticated_read_invoices" on storage.objects for select
  using (bucket_id = 'invoices' and auth.role() = 'authenticated');

create policy "authenticated_upload_invoices" on storage.objects for insert
  with check (bucket_id = 'invoices' and auth.role() = 'authenticated');

create policy "authenticated_delete_invoices" on storage.objects for delete
  using (bucket_id = 'invoices' and auth.role() = 'authenticated');

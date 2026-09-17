-- Fleet Maintenance System — multiple documents per work order
-- (2026-09-18)
--
-- work_orders.receipt_path was a single nullable text column -- a hard
-- one-file-per-work-order limit baked into the schema, unlike units
-- (unit_documents, 20260907040000_unit_documents_and_checkins.sql) which
-- already got a proper one-to-many child table for exactly this reason.
-- Mirrors that same pattern here instead of adding a second/third/etc.
-- column: a real child table, one row per uploaded file, reusing the
-- existing `invoices` storage bucket (20260827000000_invoice_storage.sql)
-- -- no new bucket needed, its RLS policies are scoped to the bucket, not
-- individual paths, so the new work-order-id-prefixed paths this table
-- uses are already covered.
--
-- Backfills one row per existing work_orders.receipt_path so an
-- already-attached invoice still shows up in the new multi-document list
-- rather than being orphaned. receipt_path itself is left in place
-- (not dropped) as inert legacy data -- the app stops reading/writing it
-- once this ships, but nothing requires removing the column.
create table work_order_documents (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  storage_path text not null,
  file_name text,
  note text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_work_order_documents_work_order_id on work_order_documents(work_order_id);

alter table work_order_documents enable row level security;
create policy "authenticated_all_work_order_documents" on work_order_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- storage_path is always "{uuid}-{filename}" (lib/invoiceFiles.js's
-- uploadReceipt) -- a uuid is always exactly 36 characters, so whatever
-- follows the 37th character (the separator dash) is the real filename,
-- regardless of any dashes inside the filename itself (split_part on '-'
-- would instead grab a fragment of the uuid).
insert into work_order_documents (work_order_id, storage_path, file_name, created_at)
select id, receipt_path, substring(receipt_path from 38), created_at
from work_orders
where receipt_path is not null;

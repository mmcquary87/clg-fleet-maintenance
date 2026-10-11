-- Fleet Maintenance System — inbound email receipt intake
--
-- A dedicated email address (set up outside this repo, via an inbound-email
-- parsing provider -- see supabase/functions/email-intake/index.ts's own
-- header) lets anyone forward a roadside/vendor receipt by email instead of
-- someone retyping it into NewWorkOrderForm by hand. The provider posts each
-- message to the email-intake edge function, which runs the SAME
-- scan-invoice extraction NewWorkOrderForm's own "Scan with AI" button uses
-- (called server-to-server with the service role key, since an inbound
-- webhook has no user JWT) and lands a row here.
--
-- This table is deliberately NOT work_orders -- scan-invoice's own design
-- never writes to the database directly, always leaving a human to review
-- and correct the extraction before anything real gets created (CLAUDE.md:
-- "it never writes to the database itself"). An email landing here commits
-- to nothing: a dispatcher reviews it in the Receipt Inbox and either
-- converts it to a real work order (prefilling NewWorkOrderForm, same
-- review-before-save step as a manual scan) or dismisses it.
--
-- Only the email-intake function (service role, bypasses RLS) ever inserts
-- here -- no authenticated-user insert policy exists, so a logged-in CLG
-- user can review/convert/dismiss a row but can't fabricate one.

create table inbound_receipts (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  from_email text,
  subject text,

  -- Null when the email had no usable attachment at all (e.g. a receipt
  -- pasted as inline text, or a confused forward) -- still recorded so
  -- nothing silently vanishes, just with extraction_error explaining why.
  storage_path text,
  file_name text,

  -- Raw scan-invoice tool-use output: { vendor, date, invoiceRef,
  -- unitNumberGuess, lineItems: [{ category, description, cost }] }.
  -- Null when extraction failed or there was nothing to scan.
  extracted jsonb,
  extraction_error text,

  status text not null default 'pending' check (status in ('pending', 'created', 'dismissed')),
  created_work_order_id uuid references work_orders(id) on delete set null,
  dismissed_reason text,

  created_at timestamptz not null default now()
);

create index idx_inbound_receipts_status on inbound_receipts(status);

alter table inbound_receipts enable row level security;

create policy "inbound_receipts_select" on inbound_receipts
  for select using (auth.role() = 'authenticated');

-- Dispatchers convert (status -> 'created' + created_work_order_id) or
-- dismiss (status -> 'dismissed' + dismissed_reason) -- never insert/delete
-- as an authenticated user, matching the header comment above.
create policy "inbound_receipts_update" on inbound_receipts
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

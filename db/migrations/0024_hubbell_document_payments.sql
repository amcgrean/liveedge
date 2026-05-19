-- 0024_hubbell_document_payments.sql
-- ----------------------------------------------------------------------------
-- Capture payment activity per Hubbell PO/WO so the inbox shows which docs
-- have already been settled (and for how much) vs. still outstanding. Source
-- of truth is the monthly reconciliation in C:\Users\amcgrean\python\hubbell test
-- (it joins Hubbell portal check detail with AgilitySQL AR). Pushed here via
-- POST /api/admin/hubbell/payments/import.
--
-- Apply manually in Supabase SQL editor.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bids.hubbell_document_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type        varchar(10)  NOT NULL,             -- 'po' | 'wo'
  doc_number      varchar(100) NOT NULL,             -- normalized Hubbell PO/WO number
  check_number    varchar(50)  NOT NULL,
  paid_amount     numeric(12, 2) NOT NULL,
  payment_date    date,
  -- Optional linkage to the document row (filled in by the import endpoint
  -- via match on doc_type + doc_number). Nullable so payments can land for
  -- docs not yet ingested (the daily scrape will catch up later and the
  -- payment rows get linked then via a one-shot UPDATE).
  document_id     uuid REFERENCES bids.hubbell_documents(id) ON DELETE SET NULL,
  source_run_id   varchar(100),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per (doc + check_number) — re-imports are idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS hubbell_document_payments_uq
  ON bids.hubbell_document_payments (doc_type, doc_number, check_number);

CREATE INDEX IF NOT EXISTS hubbell_document_payments_document_id_idx
  ON bids.hubbell_document_payments (document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hubbell_document_payments_doc_number_idx
  ON bids.hubbell_document_payments (doc_number);

-- Denormalized rollups on hubbell_documents for fast inbox display.
-- Refreshed by the import endpoint after each batch.
ALTER TABLE bids.hubbell_documents
  ADD COLUMN IF NOT EXISTS paid_amount_total  numeric(12, 2),
  ADD COLUMN IF NOT EXISTS last_payment_date  date,
  ADD COLUMN IF NOT EXISTS last_check_number  varchar(50),
  ADD COLUMN IF NOT EXISTS payment_status     varchar(20);
  -- payment_status: 'paid' (>= extracted_total) | 'partial' (0 < paid < extracted)
  --                | 'unpaid' (no payment rows) | NULL (extracted_total unknown)

CREATE INDEX IF NOT EXISTS hubbell_documents_payment_status_idx
  ON bids.hubbell_documents (payment_status)
  WHERE payment_status IS NOT NULL;

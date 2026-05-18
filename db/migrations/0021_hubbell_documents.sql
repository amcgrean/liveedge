-- 0021_hubbell_documents.sql
-- ----------------------------------------------------------------------------
-- Replace the email-shaped Hubbell module with a portal-scrape-shaped one.
--
-- Drops:
--   bids.hubbell_emails
--   bids.hubbell_email_candidates
--   bids.hubbell_address_cache
--
-- Creates:
--   bids.hubbell_documents       — one row per PO/WO PDF pulled from the portal
--   bids.hubbell_document_sos    — junction (one document × one Agility SO)
--
-- Apply manually in Supabase SQL editor. Drizzle-kit must not run against this
-- file (the bids schema is managed manually for tables that have FKs to
-- agility_* views and to keep the email→portal transition deliberate).
-- ----------------------------------------------------------------------------

BEGIN;

-- ---- Drop old email-era tables ---------------------------------------------
DROP TABLE IF EXISTS bids.hubbell_email_candidates;
DROP TABLE IF EXISTS bids.hubbell_address_cache;
DROP TABLE IF EXISTS bids.hubbell_emails;

-- ---- hubbell_documents -----------------------------------------------------
CREATE TABLE bids.hubbell_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type           varchar(10)  NOT NULL,            -- 'po' | 'wo'
  doc_number         varchar(100) NOT NULL,            -- Hubbell PO# or WO# (canonical token)
  check_number       varchar(50),                       -- present only for paid docs sourced from check detail
  r2_key             text         NOT NULL,             -- hubbell/{yyyy}/{doc_type}/{doc_number}.pdf
  source_run_id      varchar(100) NOT NULL,             -- run tag from local scraper (e.g. 'run_2026_05_18_06_00')
  source_hash        varchar(64)  NOT NULL,             -- sha256 of PDF bytes — idempotency key

  extracted_address  text,
  extracted_city     varchar(100),
  extracted_state    varchar(50),
  extracted_zip      varchar(20),
  extracted_total    numeric(12, 2),
  extracted_need_by  date,
  line_items         jsonb,                              -- [{ sku, desc, qty, uom, unit_price, ext }]

  match_status       varchar(20)  NOT NULL DEFAULT 'unmatched',
                                                         -- 'unmatched' | 'auto_matched' | 'confirmed' | 'rejected'

  received_at        timestamptz  NOT NULL DEFAULT now(),
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX hubbell_documents_source_hash_uq
  ON bids.hubbell_documents (source_hash);

CREATE INDEX hubbell_documents_doc_number_idx
  ON bids.hubbell_documents (doc_number);

CREATE INDEX hubbell_documents_match_status_recv_idx
  ON bids.hubbell_documents (match_status, received_at DESC);

CREATE INDEX hubbell_documents_doc_type_idx
  ON bids.hubbell_documents (doc_type);

CREATE INDEX hubbell_documents_received_at_idx
  ON bids.hubbell_documents (received_at DESC);

-- ---- hubbell_document_sos (junction) ---------------------------------------
CREATE TABLE bids.hubbell_document_sos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid         NOT NULL REFERENCES bids.hubbell_documents(id) ON DELETE CASCADE,
  so_id               integer      NOT NULL,                -- agility_so_header.so_id
  cust_code           varchar(50),                          -- denormalized for fast filtering
  match_source        varchar(30)  NOT NULL,                -- 'po_number_split' | 'address' | 'manual'
  confidence          integer      NOT NULL DEFAULT 0,      -- 0–100
  match_reasons       text[]       NOT NULL DEFAULT '{}',
  confirmed_by        varchar(100),
  confirmed_at        timestamptz,
  posted_to_agility_at timestamptz,                          -- phase-2 write-back hook (always NULL today)
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX hubbell_document_sos_doc_so_uq
  ON bids.hubbell_document_sos (document_id, so_id);

CREATE INDEX hubbell_document_sos_so_id_idx
  ON bids.hubbell_document_sos (so_id);

CREATE INDEX hubbell_document_sos_document_id_idx
  ON bids.hubbell_document_sos (document_id);

CREATE INDEX hubbell_document_sos_cust_code_idx
  ON bids.hubbell_document_sos (cust_code);

COMMIT;

-- ---- Notes ------------------------------------------------------------------
-- 1. No FK from hubbell_document_sos.so_id → agility_so_header.so_id because
--    agility_so_header lives in the `public` schema and is owned by the sync
--    worker (its rows can be rewritten or temporarily missing during refresh).
--    The matcher tolerates orphan so_ids in queries (LEFT JOIN).
--
-- 2. r2_key uses doc_number as the filename — re-uploading the same PO/WO
--    overwrites the prior PDF (intended: portal sometimes re-issues a corrected
--    PDF under the same number). source_hash on the row tells us whether the
--    bytes actually changed.
--
-- 3. The capability `hubbell.review` (defined in src/lib/access-control-shared.ts)
--    guards all routes — no DB-side ACL.

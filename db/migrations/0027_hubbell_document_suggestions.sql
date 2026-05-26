-- 0027_hubbell_document_suggestions.sql
-- ----------------------------------------------------------------------------
-- Pre-computed Hubbell-doc → Agility-SO match candidates awaiting human
-- review. The matcher runs across unmatched bids.hubbell_documents in batch
-- (POST /api/admin/hubbell/documents/suggest-matches), persists candidates
-- here, then reviewers accept/reject from /admin/hubbell/suggestions. On
-- accept, a row is copied into bids.hubbell_document_sos (the authoritative
-- attach table) and this row's status flips to 'accepted'. On reject, just
-- mark status='rejected' so the same bad pair isn't re-suggested.
--
-- Rationale: ~6,800 historical Hubbell PO/WO docs were uploaded before any
-- matcher pass and currently have no SO links. Buyers never typed Hubbell
-- doc-numbers into Agility's customer-PO field, so the high-confidence
-- po_number_split signal won't help on backfill. Address-based candidates
-- need a human to confirm — this table is the queue.
--
-- Apply manually in Supabase SQL editor.
--
-- Schema hygiene: designed for the eventual `bids → hubbell` schema rename
-- (Phase 3e). No FKs into bids' bid/takeoff tables.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bids.hubbell_document_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES bids.hubbell_documents(id) ON DELETE CASCADE,
  so_id           integer NOT NULL,
  cust_code       varchar(50),
  match_source    varchar(30) NOT NULL,
  -- 'po_number_split' | 'address' | 'address_scrape'
  confidence      integer NOT NULL DEFAULT 0,
  match_reasons   text[] NOT NULL DEFAULT ARRAY[]::text[],
  status          varchar(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'accepted' | 'rejected'
  suggested_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_by     varchar(100),
  reviewed_at     timestamptz,
  source_run_id   varchar(100)
);

-- One (document, SO) pair at a time. Re-running the suggester is idempotent —
-- on conflict, do nothing (preserves a reviewer's existing accept/reject).
CREATE UNIQUE INDEX IF NOT EXISTS hubbell_document_suggestions_doc_so_uq
  ON bids.hubbell_document_suggestions (document_id, so_id);

CREATE INDEX IF NOT EXISTS hubbell_document_suggestions_status_conf_idx
  ON bids.hubbell_document_suggestions (status, confidence DESC, suggested_at DESC);

CREATE INDEX IF NOT EXISTS hubbell_document_suggestions_doc_idx
  ON bids.hubbell_document_suggestions (document_id);

CREATE INDEX IF NOT EXISTS hubbell_document_suggestions_so_idx
  ON bids.hubbell_document_suggestions (so_id);

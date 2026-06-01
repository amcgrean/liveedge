-- 0037_hubbell_match_labels.sql
-- ----------------------------------------------------------------------------
-- Dedicated training-label corpus for the Hubbell doc → Agility-SO matcher.
--
-- Two human-review loops feed this table:
--   1. The matcher-correctness loop — scripts/hubbell-review CLI + the
--      /admin/hubbell/suggestions UI. "Is this matcher suggestion right?"
--   2. The cash-application loop — the local streamlit GUI. "Which SO at this
--      jobsite should this payment apply to?" Its decisions are translated into
--      doc → SO labels and POSTed to /api/admin/hubbell/labels.
--
-- Why a dedicated table instead of columns on hubbell_document_suggestions:
-- the cash-app GUI reviews ALL SOs at a resolved jobsite, a broader pool than
-- the matcher ever suggested. Many manual decisions are for (document, SO)
-- pairs that have NO suggestion row, so they cannot hang off the suggestion
-- queue without synthesizing fake suggestions. This table holds the label
-- regardless of whether a matcher suggestion exists, and keeps the suggestion
-- queue operationally clean.
--
-- The UNIQUE key is (document_id, so_id, source) — deliberately scoped by
-- source so the two loops can each hold a row for the same pair (e.g. the CLI
-- rejected a matcher suggestion while the cash-app human found that's exactly
-- where the money went). Both viewpoints are signal for the joint corpus.
--
-- Apply manually in Supabase SQL editor.
--
-- Schema hygiene: designed for the eventual `bids → hubbell` schema rename
-- (Phase 3e). The only FK is intra-Hubbell (→ hubbell_documents); no FK into
-- bids' bid/takeoff tables, no FK into public/ERP.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bids.hubbell_match_labels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES bids.hubbell_documents(id) ON DELETE CASCADE,
  -- No FK to agility_so_header (public schema, owned by the sync worker).
  so_id         integer NOT NULL,
  label         varchar(10) NOT NULL,
  -- which review loop produced it: 'cli_review' | 'ui_review' | 'cash_app_gui' | ...
  source        varchar(40) NOT NULL,
  reason_code   varchar(40),
  -- per-signal booleans the reviewer observed: {address, ref_match, dev_house,
  -- scope_phase, amount}. Free-form jsonb so the schema doesn't churn as the
  -- signal taxonomy grows.
  signals       jsonb,
  confidence    varchar(10),
  reasoning     text,
  reviewer      varchar(100),
  -- cash-app only: the dollar amount applied to this SO (NULL for the
  -- matcher-correctness loop, which carries no money).
  apply_amount  numeric(14, 2),
  -- provenance link back to the matcher suggestion, when one existed. No FK —
  -- suggestions get wiped/re-run; this is just a soft reference.
  suggestion_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hubbell_match_labels_label_chk
    CHECK (label IN ('accept', 'reject', 'skip')),
  CONSTRAINT hubbell_match_labels_confidence_chk
    CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low'))
);

-- One row per (document, SO, review-loop). Re-submitting upserts in place.
CREATE UNIQUE INDEX IF NOT EXISTS hubbell_match_labels_doc_so_source_uq
  ON bids.hubbell_match_labels (document_id, so_id, source);

CREATE INDEX IF NOT EXISTS hubbell_match_labels_document_idx
  ON bids.hubbell_match_labels (document_id);
CREATE INDEX IF NOT EXISTS hubbell_match_labels_so_idx
  ON bids.hubbell_match_labels (so_id);
CREATE INDEX IF NOT EXISTS hubbell_match_labels_label_idx
  ON bids.hubbell_match_labels (label);
CREATE INDEX IF NOT EXISTS hubbell_match_labels_source_idx
  ON bids.hubbell_match_labels (source);

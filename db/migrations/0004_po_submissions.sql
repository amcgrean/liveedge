-- Migration: 0004_po_submissions
-- Apply in Supabase SQL Editor against the bids schema.

CREATE TABLE IF NOT EXISTS bids.po_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        VARCHAR(50)  NOT NULL,
  image_urls       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  image_keys       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  supplier_name    VARCHAR(255),
  supplier_key     VARCHAR(50),
  po_status        VARCHAR(50),
  submission_type  VARCHAR(50)  NOT NULL DEFAULT 'receiving_checkin',
  priority         VARCHAR(20),
  notes            TEXT,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
  submitted_by     VARCHAR(50)  NOT NULL,
  submitted_username VARCHAR(255),
  branch           VARCHAR(20),
  reviewer_notes   TEXT,
  reviewed_by      VARCHAR(50),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS po_submissions_po_number_idx  ON bids.po_submissions (po_number);
CREATE INDEX IF NOT EXISTS po_submissions_status_idx     ON bids.po_submissions (status);
CREATE INDEX IF NOT EXISTS po_submissions_submitted_by_idx ON bids.po_submissions (submitted_by);
CREATE INDEX IF NOT EXISTS po_submissions_branch_idx     ON bids.po_submissions (branch);
CREATE INDEX IF NOT EXISTS po_submissions_created_at_idx ON bids.po_submissions (created_at DESC);

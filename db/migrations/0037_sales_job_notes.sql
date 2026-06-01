-- Sales mobile job notes (LiveEdge-owned bids schema data).
-- Apply manually in the Supabase SQL editor per repo convention.

CREATE TABLE bids.sales_job_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id  text NOT NULL,            -- app_users id (string)
  author_name     text,
  branch_code     text,
  customer_code   text,                     -- nullable: prospect may have none
  customer_name   text,
  so_id           text,                     -- nullable: link if/when an SO exists
  address_label   text,                     -- free text, e.g. "Lot 14 Hickory Ln"
  note_type       text NOT NULL DEFAULT 'general'
                  CHECK (note_type IN ('site_visit','spec_meeting','measure','general')),
  body            text NOT NULL DEFAULT '',
  fields          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- template seam (Phase 5)
  photo_keys      text[] NOT NULL DEFAULT '{}',        -- R2 object keys
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_sales_job_notes_customer ON bids.sales_job_notes (customer_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_job_notes_so       ON bids.sales_job_notes (so_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_job_notes_author   ON bids.sales_job_notes (author_user_id, created_at DESC) WHERE deleted_at IS NULL;

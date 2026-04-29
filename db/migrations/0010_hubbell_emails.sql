-- 0010_hubbell_emails.sql
-- Inbound PO/WO email forwarding via hubbell@beisser.cloud
-- Apply manually in Supabase SQL editor.

CREATE TABLE bids.hubbell_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      VARCHAR(500) UNIQUE,
  from_email      VARCHAR(255) NOT NULL,
  from_name       VARCHAR(255),
  subject         TEXT NOT NULL,
  body_text       TEXT,
  email_type      VARCHAR(20),
  -- 'po' | 'wo' | 'other'

  -- Extracted fields from subject + body
  extracted_po_number   VARCHAR(100),
  extracted_wo_number   VARCHAR(100),
  extracted_address     TEXT,
  extracted_city        VARCHAR(100),
  extracted_state       VARCHAR(50),
  extracted_zip         VARCHAR(20),
  extracted_amount      NUMERIC(12, 2),
  extracted_description TEXT,

  -- Match result
  match_status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'matched' | 'unmatched' | 'confirmed' | 'rejected'
  confirmed_so_id       VARCHAR(50),
  confirmed_cust_code   VARCHAR(50),
  confirmed_cust_name   VARCHAR(255),
  match_confidence      NUMERIC(5, 2),

  -- Confirmation audit
  confirmed_by          VARCHAR(100),
  confirmed_at          TIMESTAMPTZ,

  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX hubbell_emails_match_status_idx    ON bids.hubbell_emails(match_status);
CREATE INDEX hubbell_emails_received_at_idx     ON bids.hubbell_emails(received_at DESC);
CREATE INDEX hubbell_emails_confirmed_so_id_idx ON bids.hubbell_emails(confirmed_so_id);

-- Match candidates — top scored SOs for each email
CREATE TABLE bids.hubbell_email_candidates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id    UUID NOT NULL REFERENCES bids.hubbell_emails(id) ON DELETE CASCADE,
  so_id       VARCHAR(50) NOT NULL,
  system_id   VARCHAR(20),
  cust_code   VARCHAR(50),
  cust_name   VARCHAR(255),
  reference   VARCHAR(255),
  shipto_address VARCHAR(255),
  shipto_city    VARCHAR(100),
  shipto_state   VARCHAR(50),
  shipto_zip     VARCHAR(20),
  confidence  NUMERIC(5, 2) NOT NULL,
  match_reasons JSONB,   -- string[]
  rank        INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX hubbell_candidates_email_id_idx ON bids.hubbell_email_candidates(email_id);
CREATE INDEX hubbell_candidates_so_id_idx    ON bids.hubbell_email_candidates(so_id);

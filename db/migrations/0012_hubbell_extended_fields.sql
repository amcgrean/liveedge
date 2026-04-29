-- 0012_hubbell_extended_fields.sql
-- Adds learned address cache table and extended extraction columns.
-- Apply manually in Supabase SQL editor.

-- Learned address cache (from 0011 — include here if not yet applied)
CREATE TABLE IF NOT EXISTS bids.hubbell_address_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_key     VARCHAR(200) NOT NULL UNIQUE,
  address_raw     VARCHAR(255),
  so_id           VARCHAR(50) NOT NULL,
  system_id       VARCHAR(20),
  cust_code       VARCHAR(50),
  cust_name       VARCHAR(255),
  shipto_address  VARCHAR(255),
  shipto_city     VARCHAR(100),
  shipto_state    VARCHAR(50),
  shipto_zip      VARCHAR(20),
  confirmed_count INTEGER NOT NULL DEFAULT 1,
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hubbell_address_cache_so_id_idx ON bids.hubbell_address_cache(so_id);

-- Extended extraction columns on hubbell_emails
ALTER TABLE bids.hubbell_emails
  ADD COLUMN IF NOT EXISTS extracted_tax_amount    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS extracted_shipping      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS extracted_need_by_date  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS extracted_contact_name  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS extracted_contact_phone VARCHAR(50);

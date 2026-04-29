-- 0011_hubbell_address_cache.sql
-- Learned address cache: stores confirmed address -> SO mappings
-- so future emails with the same job site address auto-confirm.
-- Apply manually in Supabase SQL editor.

CREATE TABLE bids.hubbell_address_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalized address key (lowercase, abbreviated) for fuzzy dedup
  address_key     VARCHAR(200) NOT NULL UNIQUE,
  address_raw     VARCHAR(255),
  -- Confirmed SO
  so_id           VARCHAR(50) NOT NULL,
  system_id       VARCHAR(20),
  cust_code       VARCHAR(50),
  cust_name       VARCHAR(255),
  shipto_address  VARCHAR(255),
  shipto_city     VARCHAR(100),
  shipto_state    VARCHAR(50),
  shipto_zip      VARCHAR(20),
  -- Usage tracking
  confirmed_count INTEGER NOT NULL DEFAULT 1,
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX hubbell_address_cache_so_id_idx ON bids.hubbell_address_cache(so_id);

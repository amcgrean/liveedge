-- Migration 0008: Agility ERP integration fields
-- Adds ERP tracking columns to the legacy bid table so we can store
-- the Agility Quote ID and SO ID after a bid is pushed to the ERP.
--
-- Apply manually in Supabase SQL editor.
-- These columns are nullable — most bids will not yet be ERP-linked.

ALTER TABLE bids.bid
  ADD COLUMN IF NOT EXISTS agility_quote_id  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS agility_so_id     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS erp_pushed_at     TIMESTAMPTZ;

-- Index for quick lookup by quote/SO number (e.g. from ERP search)
CREATE INDEX IF NOT EXISTS bid_agility_quote_id_idx ON bids.bid (agility_quote_id)
  WHERE agility_quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bid_agility_so_id_idx ON bids.bid (agility_so_id)
  WHERE agility_so_id IS NOT NULL;

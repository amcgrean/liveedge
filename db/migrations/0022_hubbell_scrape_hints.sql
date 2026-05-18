-- 0022_hubbell_scrape_hints.sql
-- ----------------------------------------------------------------------------
-- Carry the local scraper's fuzzy-address-match output through to LiveEdge so
-- the server doesn't redo work the Python agent already did. These columns are
-- populated by hubbell_daily_fetch.py via uploader.py and consumed by the
-- document matcher to short-circuit address fuzzy scoring with a deterministic
-- (cust_code, shipto_seq_num) lookup against agility_so_header.
--
-- Apply manually in Supabase SQL editor.
-- ----------------------------------------------------------------------------

ALTER TABLE bids.hubbell_documents
  ADD COLUMN IF NOT EXISTS scrape_cust_code   varchar(50),
  ADD COLUMN IF NOT EXISTS scrape_seq_num     varchar(50),
  ADD COLUMN IF NOT EXISTS scrape_match_ratio numeric(4, 3);

CREATE INDEX IF NOT EXISTS hubbell_documents_scrape_cust_seq_idx
  ON bids.hubbell_documents (scrape_cust_code, scrape_seq_num)
  WHERE scrape_cust_code IS NOT NULL;

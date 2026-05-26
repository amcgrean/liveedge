-- 0023_hubbell_document_job_context.sql
-- ----------------------------------------------------------------------------
-- Add job-context columns to bids.hubbell_documents so the document inbox can
-- show Hubbell development, house, lot, and model without opening the PDF.
-- All five fields come from the local scraper's metadata payload.
--
-- Apply manually in Supabase SQL editor.
-- ----------------------------------------------------------------------------

ALTER TABLE bids.hubbell_documents
  ADD COLUMN IF NOT EXISTS dev_code        varchar(20),
  ADD COLUMN IF NOT EXISTS dev_name        varchar(120),
  ADD COLUMN IF NOT EXISTS house_number    varchar(30),
  ADD COLUMN IF NOT EXISTS block_lot       varchar(30),
  ADD COLUMN IF NOT EXISTS model_elevation varchar(200);

CREATE INDEX IF NOT EXISTS hubbell_documents_dev_code_idx
  ON bids.hubbell_documents (dev_code)
  WHERE dev_code IS NOT NULL;

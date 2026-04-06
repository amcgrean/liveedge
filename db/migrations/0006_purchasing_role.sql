-- Add is_purchasing flag to bids."user" table
-- Grants purchasing/yard staff access to PO check-in and open POs
-- Apply manually in Supabase SQL editor

ALTER TABLE bids."user"
  ADD COLUMN IF NOT EXISTS is_purchasing BOOLEAN NOT NULL DEFAULT FALSE;

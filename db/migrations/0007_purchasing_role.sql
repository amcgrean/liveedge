-- Migration: purchasing role column
-- Apply manually in Supabase SQL editor (was applied 2026-04-09 via MCP)
--
-- Adds is_purchasing boolean to bids."user" so the purchasing role
-- can be stored and queried alongside is_warehouse / is_receiving_yard.

ALTER TABLE bids."user" ADD COLUMN IF NOT EXISTS is_purchasing boolean NOT NULL DEFAULT false;

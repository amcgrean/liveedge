-- Migration 0016: dispatch stop time windows, notes, bay, will-call state
-- Apply in Supabase SQL editor (public schema — dispatch tables live in public, not bids)
-- These tables were created by the WH-Tracker migration.

ALTER TABLE dispatch_route_stops
  ADD COLUMN IF NOT EXISTS time_window_start text,
  ADD COLUMN IF NOT EXISTS time_window_end   text,
  ADD COLUMN IF NOT EXISTS eta_minutes       integer,
  ADD COLUMN IF NOT EXISTS notes             text,
  ADD COLUMN IF NOT EXISTS bay_number        text,
  ADD COLUMN IF NOT EXISTS wc_notified_at    timestamptz;

-- Index for fast lookup of stops with notes
CREATE INDEX IF NOT EXISTS idx_dispatch_route_stops_route_id
  ON dispatch_route_stops (route_id);

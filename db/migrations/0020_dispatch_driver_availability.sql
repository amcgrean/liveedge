-- Migration 0020: dispatch driver availability + stop arrival/departure tracking
-- Apply in Supabase SQL editor (public schema — dispatch tables live in public, not bids)
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards throughout).

-- ── dispatch_drivers: availability state ──────────────────────────────────────
-- clocked_in: driver has checked in for the day
-- on_route_id: FK to the dispatch_route they are currently running (null = not on a route)

ALTER TABLE dispatch_drivers
  ADD COLUMN IF NOT EXISTS clocked_in    boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clocked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_route_id   integer  REFERENCES dispatch_routes(id) ON DELETE SET NULL;

-- ── dispatch_route_stops: arrival / departure timestamps ──────────────────────

ALTER TABLE dispatch_route_stops
  ADD COLUMN IF NOT EXISTS arrived_at   timestamptz,
  ADD COLUMN IF NOT EXISTS departed_at  timestamptz;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Fast lookup of clocked-in drivers by branch
CREATE INDEX IF NOT EXISTS idx_dispatch_drivers_clocked_in
  ON dispatch_drivers (branch_code, clocked_in)
  WHERE clocked_in = true;

-- Fast lookup of stops that have arrived/departed (for ETA tracking)
CREATE INDEX IF NOT EXISTS idx_dispatch_stops_arrived
  ON dispatch_route_stops (route_id, arrived_at)
  WHERE arrived_at IS NOT NULL;

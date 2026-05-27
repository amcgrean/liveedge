-- 0034_dispatch_route_completion_agility.sql
-- Add Agility-sourced route columns to bids.dispatch_route_completion_log so
-- the same log table can record alerts triggered by the Pi-side reconciler
-- (which groups agility_shipments by ship_date + route_id_char + driver) in
-- addition to the LiveEdge-sourced trigger that already shipped in 0033.
--
-- Background: dispatch builds routes in the OLD POD system today, not in the
-- LiveEdge dispatch board, so public.dispatch_route_stops is empty/stale and
-- the LiveEdge deliver-endpoint hook never fires. The Pi's beisser_sync.py
-- already pulls agility_shipments into Supabase; once delivery status flips
-- in Agility, the Pi can detect a fully-delivered "route" (group) and POST
-- to LiveEdge's new /api/dispatch/agility-route-complete endpoint.
--
-- Apply manually in Supabase SQL editor.

-- 1. Make route_id nullable. LiveEdge-sourced rows still set it; Agility-
--    sourced rows leave it NULL and populate the agility_* columns instead.
ALTER TABLE bids.dispatch_route_completion_log
  ALTER COLUMN route_id DROP NOT NULL;

-- 2. New columns identifying an Agility-side load. Indexed for dedupe lookup.
ALTER TABLE bids.dispatch_route_completion_log
  ADD COLUMN IF NOT EXISTS route_source        text NOT NULL DEFAULT 'liveedge'
    CHECK (route_source IN ('liveedge','agility')),
  ADD COLUMN IF NOT EXISTS system_id           text,
  ADD COLUMN IF NOT EXISTS agility_route_code  text,
  ADD COLUMN IF NOT EXISTS agility_ship_date   date,
  ADD COLUMN IF NOT EXISTS shipment_count      integer;

-- 3. Either source-side identity must be present.
ALTER TABLE bids.dispatch_route_completion_log
  ADD CONSTRAINT dispatch_route_completion_log_source_chk
  CHECK (
    (route_source = 'liveedge' AND route_id IS NOT NULL)
    OR
    (route_source = 'agility'  AND system_id IS NOT NULL AND agility_ship_date IS NOT NULL)
  );

-- 4. Dedupe-lookup index for Agility-sourced rows. The Pi can POST the same
--    completion repeatedly without spamming because the orchestrator queries
--    this tuple before invoking providers.
CREATE INDEX IF NOT EXISTS dispatch_route_completion_log_agility_idx
  ON bids.dispatch_route_completion_log (system_id, agility_ship_date, agility_route_code, driver_name)
  WHERE route_source = 'agility';

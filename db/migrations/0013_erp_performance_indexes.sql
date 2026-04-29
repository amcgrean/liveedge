-- Performance indexes for ERP mirror tables (public schema)
-- Apply manually in Supabase SQL editor — NOT via drizzle-kit
-- These target the warehouse picks board and work orders queries.

-- ─── agility_so_header ───────────────────────────────────────────────────────
-- Picks board: filters on is_deleted + so_status + sale_type, scoped to system_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_so_header_picks
  ON public.agility_so_header (is_deleted, so_status, sale_type, system_id);

-- Joins from agility_so_lines on (system_id, so_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_so_header_system_so
  ON public.agility_so_header (system_id, so_id)
  WHERE is_deleted = false;

-- ─── agility_so_lines ────────────────────────────────────────────────────────
-- Picks board JOIN and work orders JOIN on (system_id, so_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_so_lines_system_so
  ON public.agility_so_lines (system_id, so_id)
  WHERE is_deleted = false;

-- Picks board: GROUP BY on handling_code
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_so_lines_handling
  ON public.agility_so_lines (system_id, so_id, handling_code)
  WHERE is_deleted = false;

-- Work orders JOIN on so_id + sequence
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_so_lines_wo_join
  ON public.agility_so_lines (so_id, sequence)
  WHERE is_deleted = false;

-- ─── agility_picks ───────────────────────────────────────────────────────────
-- pick_rollup CTE: filters on tran_type, print_status, created_date, grouped by system_id + tran_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_picks_rollup
  ON public.agility_picks (is_deleted, tran_type, print_status, system_id, tran_id, created_date)
  WHERE is_deleted = false;

-- ─── agility_shipments ───────────────────────────────────────────────────────
-- shipment_rollup CTE: grouped by system_id + so_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_shipments_system_so
  ON public.agility_shipments (system_id, so_id)
  WHERE is_deleted = false;

-- ─── agility_wo_header ───────────────────────────────────────────────────────
-- Work orders board: filters on is_deleted + wo_status, ordered by wo_id DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_wo_header_status
  ON public.agility_wo_header (is_deleted, wo_status);

-- Work orders search by source_id (SO number)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agility_wo_header_source
  ON public.agility_wo_header (source_id, source)
  WHERE is_deleted = false;

-- ─── pick (WH-Tracker local table) ───────────────────────────────────────────
-- open-picks query: completed_time IS NULL filter, joined on picker_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pick_open
  ON public.pick (picker_id, completed_time)
  WHERE completed_time IS NULL;

-- picker-stats query: date range on completed_time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pick_completed
  ON public.pick (picker_id, completed_time)
  WHERE completed_time IS NOT NULL;

-- 0032_agility_so_header_so_id_only_idx.sql
--
-- All existing indexes on public.agility_so_header that include `so_id` are
-- composite and lead with `system_id`:
--   uq_agility_so_header           (system_id, so_id)
--   idx_agility_so_header_so_id    (system_id, so_id)
--   ...
--
-- Hubbell suggestions endpoint (and any other call site that resolves an
-- arbitrary set of SO IDs without knowing their branch first) does
-- `WHERE so_id IN (...) AND is_deleted = false`. Without system_id as a
-- leading predicate, Postgres can't seek the composite index — it falls
-- back to a full index scan or sequential scan (measured: 1102ms for 5
-- ids over the 1M-row table). That blew the Vercel function timeout on
-- /admin/hubbell/suggestions?status=accepted.
--
-- Partial index on `(so_id) WHERE is_deleted=false` brings the same
-- lookup to 0.18ms.
--
-- Applied via Supabase MCP on 2026-05-26.

CREATE INDEX IF NOT EXISTS idx_agility_so_header_so_id_only
  ON public.agility_so_header (so_id)
  WHERE is_deleted = false;

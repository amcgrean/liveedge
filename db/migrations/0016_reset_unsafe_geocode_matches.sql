-- 0016_reset_unsafe_geocode_matches.sql
-- Reset rows placed by the old unsafe "state-unique" tier and the legacy
-- WH-Tracker sqlite fuzzy matcher. Both accepted matches based only on
-- (number, street, state) without verifying city or zip, which placed many
-- Polk City customers up to 141 miles off (in Cedar Rapids / Delaware Co).
--
-- After applying:
--   1. Recreate public.geocode_index if missing (0014).
--   2. Reload OpenAddresses + Polk County atlas data.
--   3. Next /api/cron/geocode-nightly run will re-match these via the
--      tightened tier-3 (now requires zip-3 or city corroboration).
--
-- Apply manually in Supabase SQL editor.

UPDATE public.agility_customers
   SET lat = NULL,
       lon = NULL,
       geocode_source = 'failed',
       geocoded_at = NULL
 WHERE geocode_source IN ('openaddresses_state_unique', 'sqlite_state_fuzzy');

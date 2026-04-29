-- 0014_geocode_index.sql
-- Reference dataset for address-level geocoding. Loaded from OpenAddresses.io
-- per state (https://openaddresses.io/) by `db/load-openaddresses.ts`.
-- Used by LiveEdge admin geocode-backfill to fill agility_customers.lat/lon
-- for ship-to records the existing local-GeoJSON pipeline could not match.
--
-- Apply manually in Supabase SQL editor. Lives in `public` so the same
-- index can be reused by the WH-Tracker geocoder pipeline if desired.

CREATE TABLE IF NOT EXISTS public.geocode_index (
  id            BIGSERIAL PRIMARY KEY,
  -- Normalized lookup keys (uppercase, abbreviated, no punctuation)
  number_norm   TEXT NOT NULL,
  street_norm   TEXT NOT NULL,
  city_norm     TEXT,
  state_norm    TEXT,                 -- 'IA', 'IL', etc.
  postcode      TEXT,                 -- 5-digit zip (no +4)
  -- Raw values for display / debugging
  number_raw    TEXT,
  street_raw    TEXT,
  unit          TEXT,
  city_raw      TEXT,
  -- Coordinates
  lat           NUMERIC(9,6) NOT NULL,
  lon           NUMERIC(9,6) NOT NULL,
  -- Provenance
  source        TEXT,                 -- e.g. 'us-ia-polk', 'us-ia-statewide'
  source_hash   TEXT,                 -- OpenAddresses HASH column
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT geocode_index_lat_chk CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT geocode_index_lon_chk CHECK (lon BETWEEN -180 AND 180)
);

-- Primary lookup: number + street + city
CREATE INDEX IF NOT EXISTS geocode_index_number_street_city_idx
  ON public.geocode_index (number_norm, street_norm, city_norm);

-- Fallback lookup: number + street + zip (when city is misspelled)
CREATE INDEX IF NOT EXISTS geocode_index_number_street_zip_idx
  ON public.geocode_index (number_norm, street_norm, postcode);

-- State scoping for bulk operations
CREATE INDEX IF NOT EXISTS geocode_index_state_idx
  ON public.geocode_index (state_norm);

-- Dedup helper: same OpenAddresses row should not be inserted twice
CREATE UNIQUE INDEX IF NOT EXISTS geocode_index_source_hash_uq
  ON public.geocode_index (source, source_hash)
  WHERE source IS NOT NULL AND source_hash IS NOT NULL;

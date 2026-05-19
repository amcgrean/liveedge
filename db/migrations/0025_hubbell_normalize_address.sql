-- 0025_hubbell_normalize_address.sql
-- ----------------------------------------------------------------------------
-- Helper function used by the Hubbell jobs queries to compare an SO's
-- shipto_address_1 against a doc's extracted_address. The naive
-- lowercase+strip-non-alphanumerics that PR #328's docs_for_site CTE used
-- treats "1000 Featherstone Ave NE" and "1000 Featherstone Avenue NE" as
-- different — Codex flagged this as a P1 regression (real-world Hubbell PDFs
-- vs ERP shiptos sometimes disagree on abbreviation).
--
-- This function:
--   1. Lowercases.
--   2. Expands every common US street-type abbreviation to its long form
--      ("ave" → "avenue", "st" → "street", "blvd" → "boulevard", etc.).
--   3. Strips all non-alphanumerics so spacing/punctuation differences
--      don't matter.
--
-- IMMUTABLE + PARALLEL SAFE so Postgres can plan it freely; could be used
-- in an expression index later if perf demands it.
--
-- Apply manually in Supabase SQL editor.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION bids.hubbell_normalize_address(addr text)
RETURNS text
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            regexp_replace(
                              regexp_replace(
                                regexp_replace(
                                  regexp_replace(
                                    regexp_replace(
                                      lower(coalesce(addr, '')),
                                      '\mavn?\.?\M',  'avenue',    'g'),
                                    '\mblvd\.?\M',    'boulevard', 'g'),
                                  '\mcir\.?\M',       'circle',    'g'),
                                '\mct\.?\M',          'court',     'g'),
                              '\mdr\.?\M',            'drive',     'g'),
                            '\mhwy\.?\M',             'highway',   'g'),
                          '\mln\.?\M',                'lane',      'g'),
                        '\mpkwy\.?\M',                'parkway',   'g'),
                      '\mpl\.?\M',                    'place',     'g'),
                    '\mpt\.?\M',                      'point',     'g'),
                  '\mrd\.?\M',                        'road',      'g'),
                '\msq\.?\M',                          'square',    'g'),
              '\mst\.?\M',                            'street',    'g'),
            '\mter\.?\M',                             'terrace',   'g'),
          '\mtrl\.?\M',                               'trail',     'g'),
        '\mxing\.?\M',                                'crossing',  'g'),
      '\mtwp\.?\M',                                   'township',  'g'),
    '[^a-z0-9]', '', 'g'
  );
$$;

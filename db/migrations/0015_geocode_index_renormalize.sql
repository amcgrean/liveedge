-- 0015_geocode_index_renormalize.sql
-- One-time backfill: re-normalize `geocode_index.street_norm` to match the
-- updated `normalizeAddress()` rules from src/lib/geocode.ts (PR #204).
--
-- Background: PR #204 extended the normalizer to collapse a street-type token
-- at the second-to-last position when followed by a direction (e.g.
-- "TUSCANY DRIVE SE" → "TUSCANY DR SE", "8TH STREET NW" → "8TH ST NW"). The
-- index was loaded BEFORE that change deployed, so existing rows still carry
-- the long-form spelling. The customer-side matcher now uses the new rules,
-- so JOINs against the index miss for any address with this pattern.
--
-- This migration applies the same transformation in-place to the index. After
-- it runs, ~75K rows in major-direction Iowa addresses become matchable
-- again. Future OA reloads will use the new normalizer naturally.
--
-- Idempotent: WHERE clause only matches rows still carrying the long form.
-- Apply manually in Supabase SQL editor.

WITH street_type_map AS (
  SELECT * FROM (VALUES
    ('STREET', 'ST'),    ('AVENUE', 'AVE'),  ('AV', 'AVE'),
    ('ROAD', 'RD'),      ('DRIVE', 'DR'),    ('BOULEVARD', 'BLVD'),
    ('BLV', 'BLVD'),     ('COURT', 'CT'),    ('LANE', 'LN'),
    ('PLACE', 'PL'),     ('CIRCLE', 'CIR'),  ('TERRACE', 'TER'),
    ('TERR', 'TER'),     ('PARKWAY', 'PKWY'),('HIGHWAY', 'HWY'),
    ('TRAIL', 'TRL'),    ('SQUARE', 'SQ'),   ('PLAZA', 'PLZ'),
    ('RIDGE', 'RDG'),    ('POINT', 'PT'),    ('CROSSING', 'XING'),
    ('HEIGHTS', 'HTS')
  ) AS t(long_form, abbr)
),
fixes AS (
  SELECT
    gi.id,
    regexp_replace(
      gi.street_norm,
      '\m' || stm.long_form || '\M (N|S|E|W|NE|NW|SE|SW)$',
      stm.abbr || ' \1'
    ) AS new_street_norm
  FROM public.geocode_index gi
  JOIN street_type_map stm
    ON gi.street_norm ~ ('\m' || stm.long_form || '\M (N|S|E|W|NE|NW|SE|SW)$')
)
UPDATE public.geocode_index gi
   SET street_norm = fixes.new_street_norm
  FROM fixes
 WHERE gi.id = fixes.id
   AND gi.street_norm <> fixes.new_street_norm;

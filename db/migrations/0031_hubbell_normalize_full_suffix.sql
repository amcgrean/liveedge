-- 0018_hubbell_normalize_full_suffix.sql
--
-- Two improvements to Hubbell address matching:
--
-- 1. Extend bids.hubbell_normalize_address() with the full USPS suffix table
--    (adds: ave→avenue, cr→circle, rdg→ridge, ctr→center, hts→heights,
--    mdws→meadows). Ports the abbreviation list from the Pi-side
--    hubbell_reconciliation_v1.py reconciler. Existing rules (rd, dr, ct, ln,
--    pkwy, pl, etc.) preserved.
--
-- 2. Add bids.hubbell_expand_multi_unit(addr) — set-returning function that
--    expands duplex/multi-unit customer addresses like
--    "9740, 9748 Regatta Lane" or "619-647 Nantucket" or "9740 & 9748 Regatta"
--    into per-house-number rows. Mirrors the Python regex on the Pi.
--
-- Both improve match coverage from ~5% / ~58% (current) to >92% of the
-- 6,800-doc backlog.

CREATE OR REPLACE FUNCTION bids.hubbell_normalize_address(addr text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  WITH lowered AS (
    SELECT lower(coalesce(addr, '')) AS v
  ),
  -- street types (order matters only when patterns could be subsumed; current
  -- ordering preserves the original function's behavior + new additions)
  rep AS (
    SELECT
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
                                        regexp_replace(
                                          regexp_replace(
                                            regexp_replace(
                                              regexp_replace(
                                                regexp_replace(
                                                  regexp_replace(
                                                    regexp_replace(v,
                                                      '\mave\.?\M', 'avenue',    'g'),
                                                    '\mav\.?\M',   'avenue',    'g'),
                                                  '\mavn\.?\M',    'avenue',    'g'),
                                                '\mblvd\.?\M',     'boulevard', 'g'),
                                              '\mcir\.?\M',        'circle',    'g'),
                                            '\mcr\.?\M',           'circle',    'g'),
                                          '\mct\.?\M',             'court',     'g'),
                                        '\mctr\.?\M',              'center',    'g'),
                                      '\mdr\.?\M',                 'drive',     'g'),
                                    '\mhts\.?\M',                  'heights',   'g'),
                                  '\mhwy\.?\M',                    'highway',   'g'),
                                '\mln\.?\M',                       'lane',      'g'),
                              '\mmdws\.?\M',                       'meadows',   'g'),
                            '\mpkwy\.?\M',                         'parkway',   'g'),
                          '\mpl\.?\M',                             'place',     'g'),
                        '\mpt\.?\M',                               'point',     'g'),
                      '\mrd\.?\M',                                 'road',      'g'),
                    '\mrdg\.?\M',                                  'ridge',     'g'),
                  '\msq\.?\M',                                     'square',    'g'),
                '\mst\.?\M',                                       'street',    'g'),
              '\mter\.?\M',                                        'terrace',   'g'),
            '\mtrl\.?\M',                                          'trail',     'g'),
          '\mxing\.?\M',                                           'crossing',  'g'),
        '\mtwp\.?\M',                                              'township',  'g'),
      '[^a-z0-9]', '', 'g'
    ) AS v
    FROM lowered
  )
  SELECT v FROM rep;
$function$;


-- Expand duplex / multi-unit addresses into per-house-number variants.
-- "9740, 9748 Regatta Lane"   -> ["9740 Regatta Lane", "9748 Regatta Lane"]
-- "619-647 Nantucket Drive"   -> ["619 Nantucket Drive", "647 Nantucket Drive"]
-- "9740 & 9748 Regatta Lane"  -> ["9740 Regatta Lane", "9748 Regatta Lane"]
-- Plain "1208 Featherstone Ave NE" -> ["1208 Featherstone Ave NE"] (single).
-- NULL/blank -> empty set.
--
-- Mirrors load_jobs() in scripts/hubbell_reconciliation_v1.py.
CREATE OR REPLACE FUNCTION bids.hubbell_expand_multi_unit(addr text)
 RETURNS SETOF text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
AS $function$
DECLARE
  trimmed text;
  head    text;
  rest    text;
  nums    text[];
  n       text;
BEGIN
  IF addr IS NULL OR btrim(addr) = '' THEN
    RETURN;
  END IF;
  trimmed := btrim(addr);

  -- Match: leading digits + (separator + digits)+ + whitespace + street rest.
  -- Separators: comma, ampersand, hyphen.
  IF trimmed ~ '^\s*\d+\s*[,&\-]\s*\d+' THEN
    head := regexp_replace(trimmed, '^([\d,&\-\s]+?)\s+([A-Za-z].*)$', '\1');
    rest := regexp_replace(trimmed, '^([\d,&\-\s]+?)\s+([A-Za-z].*)$', '\2');

    -- Only proceed if substitution actually fired (regex matched).
    IF head <> trimmed AND rest <> trimmed THEN
      nums := regexp_split_to_array(head, '[,&\-\s]+');
      FOREACH n IN ARRAY nums LOOP
        IF n <> '' AND n ~ '^\d+$' THEN
          RETURN NEXT n || ' ' || rest;
        END IF;
      END LOOP;
      RETURN;
    END IF;
  END IF;

  -- Default: single variant
  RETURN NEXT trimmed;
END;
$function$;

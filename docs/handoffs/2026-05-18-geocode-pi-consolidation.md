# Handoff — Geocoding consolidated on the Pi (2026-05-18 → 2026-05-20)

> **2026-05-20 addendum (read first):** The P0–P3 items below all shipped on
> 2026-05-19/20. Concretely: the Pi service is healthy (chmod fix merged via
> beisser-api PR #36 → cherry-picked into the `pi` branch); the tier-3 matcher
> fix is live (PR #35 merged + deployed on Pi); the Polk + Dallas Python
> loaders shipped on the `claude/practical-elion-f73f74` branch and ran on
> the Pi (172,420 Polk + 27,944 Dallas parcel rows in `geocode.db`). A bulk
> rematch on 6,966 reset Polk/Dallas customers placed 1,929 new pins
> (50.4%); the other 1,898 are the direction-prefix wall described in P5.
> One important add not in the original doc: an index on
> `(street_norm, state_norm)` was created on `geocode.db` — required for
> tier-3 to be usable (without it, full-scan over 74M rows = 60 rows/hr).
> **Remaining priorities** now are **Johnson County loader (P4)** and the
> **4th-tier fuzzy matcher (P5)**.


## Who picks this up next: **Pi agent** (`C:\Users\amcgrean\python\api`)

Not LiveEdge. LiveEdge's geocoding code path is now inert:
- `/api/cron/geocode-nightly` returns a no-op 200
- `public.geocode_index` table dropped from Supabase (666 MB freed)
- `src/lib/geocode-runner.ts` + `scripts/load-*-into-index.ts` kept only as
  algorithm reference

The Pi (`agility-api-sync.service` → `agility_api/geocoder_sqlite.py`) is
now the **only** geocoder writing to `agility_customers.lat/lon`. The
remaining work is on that side.

## What landed today

### LiveEdge ([liveedge#319](https://github.com/amcgrean/liveedge/pull/319) → [#321](https://github.com/amcgrean/liveedge/pull/321), merged)
- Safer tier-3: `openaddresses_state_unique` now requires zip-3 OR city match
- Tightened junk filter: `address_1 ~ '^\s*\d'` (was `'[0-9]'`)
- Raised cron zero-progress threshold from 5 → 10 batches
- `db/migrations/0016_reset_unsafe_geocode_matches.sql` applied — wiped 1,415
  poisoned rows (`openaddresses_state_unique` + `sqlite_state_fuzzy`) to `failed`
- Vercel cron entry removed from `vercel.json`
- `public.geocode_index` dropped from Supabase
- `app/api/cron/geocode-nightly/route.ts` short-circuited to a no-op stub

### Pi ([beisser-api#35](https://github.com/amcgrean/beisser-api/pull/35), awaiting merge)
- `SqliteGeocoder.geocode()` tier-3 (`sqlite_state_fuzzy`) now requires zip-3 OR
  city corroboration before binding to "closest house number on this street
  in the state"

## Unmatched ship-tos by county (current state — 2026-05-18)

~11,200 IA customers without `lat`/`lon`:

| County | Unmatched | Public data | Action |
|---|---:|---|---|
| Polk | 5,265 | Polk County REST atlas (already snapshotted) | Re-run on Pi after fix |
| Webster | 1,765 | Beacon-only — no public REST/shapefile | Deferred / needs scraping |
| Dallas | 1,265 | Shapefile downloaded to `tmp/dallas/GIS_data/` | **Port loader to Pi (Python)** |
| Other small towns | 884 | Mixed | Long tail |
| Johnson | 561 | REST at `gis.johnsoncountyiowa.gov/arcgis/rest/services/LandRecords/Land_Records/MapServer` | **Build Python loader on Pi** |
| Polk/Dallas (West DSM) | 436 | Both atlases above | Covered once both load |
| Warren | 217 | Beacon-only | Deferred |
| Story / Madison / Marion / Boone / Humboldt / Calhoun / Linn / Greene / Guthrie / Hamilton / Cerro Gordo / Cedar / Iowa / Des Moines | ~700 combined | Mostly Beacon-only | Deferred / long tail |

## Priority work for next Pi agent

### P0 — Fix the Pi service first
`agility-api-sync.service` is in a restart loop: `status=203/EXEC` from
`/home/api/beisser-api/run_repo_worker.sh` (missing, non-executable, or bad
shebang). Until this is fixed, **none of the geocoding work below will run**,
and merging beisser-api PR #35 won't take effect.

```bash
ssh api@agility-api 'sudo systemctl status agility-api-sync.service'
ssh api@agility-api 'ls -la /home/api/beisser-api/run_repo_worker.sh'
ssh api@agility-api 'head -1 /home/api/beisser-api/run_repo_worker.sh'  # check shebang
```

### P1 — Merge beisser-api PR #35
The matcher fix is a one-line algorithmic change. Review, merge, deploy.
After deploy, spot-check a few previously-misplaced customers:

```sql
SELECT cust_code, address_1, city, zip, lat, lon, geocode_source
FROM public.agility_customers
WHERE cust_code IN ('BENT1000','RJBU1000','J3HO1000','HUBB1200')
  AND UPPER(TRIM(city)) = 'POLK CITY';
```

All four should remain `failed` (lat/lon NULL) until the parcel data lands —
that's correct. Better than wildly misplaced.

### P2 — Port Polk County loader to Python
Source script (TS): `/c/Users/amcgrean/python/beisser-takeoff/scripts/load-polk-county-into-index.ts`
Snapshot data: `/c/Users/amcgrean/python/beisser-takeoff/tmp/polk-snapshot/` (3 NDJSON files, ~430 MB total)

Algorithm in pseudo:
1. Read `layer4_parcel_tax_attributes.ndjson` → build `{parcel_number: PrimarySitus}` dict
2. Read `layer0_tax_parcel_points.ndjson` → build `{parcel_number: (lat, lon)}` dict (unit-level points)
3. Stream `layer3_tax_parcels.ndjson`, for each parcel:
   - Look up address from dict #1
   - Get point from dict #2, or compute polygon centroid as fallback
   - Run through `normalizeAddress`-equivalent (already exists in `agility_api/geocoder.py` as `_split` + `normalize_text`)
   - INSERT into Pi's local SQLite `geocode_index` with `source='polk_county_ia_atlas'`, `source_hash=parcel_number`
4. `INSERT OR IGNORE` on `(source, source_hash)` for idempotency

Expected: ~172K rows loaded. Then trigger a bulk re-pass via
`scripts/run_geocoding_bulk.py` to recover the 5,265 unmatched Polk rows.

### P3 — Port Dallas County loader to Python
Source script (TS): `/c/Users/amcgrean/python/beisser-takeoff/scripts/load-dallas-into-index.ts`
Source data: `/c/Users/amcgrean/python/beisser-takeoff/tmp/dallas/GIS_data/` (shapefile + CSV)

Dallas is harder than Polk because:
- Geometry is in Iowa State Plane South (NAD83, US Survey Feet) — needs `pyproj` reprojection to WGS84
- Shapefile DBF has only `PARCELID`; address fields are in a sibling CSV `ParcelShape.txt`
- `SitusStreetName` in the CSV is truncated to 2 chars — unusable. Falls back to `MailLine1` when mail city/state matches situs city/state (owner-occupied flag)

Use `pyshp` + `pyproj` + `csv` stdlib. The TS version produced ~28K rows; expect similar from Python.

Expected uplift: ~1,200 Dallas customers (Waukee, Adel, West DSM Dallas side).

### P4 — Build Johnson County loader (new, no existing template)
- REST endpoint: `https://gis.johnsoncountyiowa.gov/arcgis/rest/services/LandRecords/Land_Records/MapServer`
- Layer 4: House Numbers (Point) — preferred for accuracy
- Layer 9: Parcels (Polygon) — fallback for centroid
- Same pattern as Polk: paginate via `resultOffset` + `exceededTransferLimit`, request `outSR=4326` for WGS84
- Tag as `source='johnson_county_ia_atlas'`, `source_hash=<parcel_number_field>` (TBD from inspecting layer attrs)

Expected uplift: ~561 customers (Iowa City, Coralville, North Liberty, Tiffin).

### P5 (optional) — 4th-tier fuzzy matcher
~1,500–2,500 customers fail today because of direction-prefix mismatches:
- Customer: `"613 Grimes Street"` → `street_norm = "GRIMES ST"`
- Atlas: `"613 E Grimes St"` → `street_norm = "E GRIMES ST"`
- No tier matches

Add a 4th tier in `SqliteGeocoder` that strips leading/trailing directionals
from `street_norm` and retries the city/zip lookup. Tag as `sqlite_fuzzy_dir`
so the relaxation is visible in `geocode_source`. Keep it gated on city OR
zip-3 corroboration to avoid re-introducing the wild-misplacement bug.

## Things to leave alone (Hubbell isolation)
Per the Hubbell agent's confirmation, this work is fully isolated from:
- `/home/api/hubbell/` on the Pi
- `bids.hubbell_documents` / `bids.hubbell_document_sos` tables
- `HUBBELL_UPLOAD_TOKEN` env var

## Useful queries for audit

```sql
-- Source distribution + bounding-box sanity
SELECT geocode_source, COUNT(*),
       COUNT(*) FILTER (WHERE lat BETWEEN 40.3 AND 43.6 AND lon BETWEEN -96.7 AND -90.1) AS in_iowa
FROM public.agility_customers
WHERE is_deleted = false AND UPPER(TRIM(state)) = 'IA'
GROUP BY 1 ORDER BY 2 DESC;

-- Polk City spot-check (should be 0 outside the Polk City bbox)
SELECT geocode_source, COUNT(*),
       COUNT(*) FILTER (WHERE NOT (lat BETWEEN 41.65 AND 41.90 AND lon BETWEEN -93.85 AND -93.55)) AS placed_wrong
FROM public.agility_customers
WHERE UPPER(TRIM(city)) = 'POLK CITY' AND UPPER(TRIM(state)) = 'IA' AND is_deleted = false
GROUP BY 1;

-- Force-requeue a county after loading new parcel data:
-- (use scripts/reset-geocode-attempts.ts equivalent on Pi side, chunked)
UPDATE public.agility_customers SET geocoded_at = NULL
WHERE geocode_source = 'failed'
  AND UPPER(TRIM(city)) = ANY(ARRAY['WAUKEE','ADEL','GRANGER',...]);
```

## Re-enabling LiveEdge geocoding (if ever needed)
The route is dormant, not deleted. To revive:
1. Re-apply `db/migrations/0014_geocode_index.sql` in Supabase
2. Reload OpenAddresses + parcel data via the TS scripts (`scripts/load-*-into-index.ts`)
3. Restore `app/api/cron/geocode-nightly/route.ts` to call the original handler
   (rename `_disabled_GET` → `GET`, remove the stub)
4. Re-add the cron entry to `vercel.json`

Don't do this unless the Pi-side approach hits a wall — the whole point of
the move was to avoid Supabase storage bloat and dueling writers.

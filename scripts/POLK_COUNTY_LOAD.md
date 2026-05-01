# Polk County IA Atlas — snapshot + load workflow

Captures the full Polk County IA assessor atlas (parcel addresses + lat/lon)
and loads it into `public.geocode_index` so the geocoder can match metro
Des Moines / Polk-County customers without depending on the live atlas.

**Why:** Polk County IA's atlas REST endpoint
(`https://atlas.polkcountyiowa.gov/server/Attribute_Query/FeatureServer`) is
publicly accessible today, but there's no guarantee it stays that way. Running
the snapshot + load below copies ~172K parcel-level address points into our
geocode_index permanently.

## Step 1 — Snapshot (~2 min)

Pulls all three layers from the atlas and writes NDJSON files locally.

```bash
OUT_DIR=./tmp/polk-snapshot npx tsx scripts/snapshot-polk-county-atlas.ts
```

Produces:
- `layer0_tax_parcel_points.ndjson` (~12K, apartment unit pinpoints, point geom)
- `layer3_tax_parcels.ndjson` (~208K, parcel polygons — large, ~135MB)
- `layer4_parcel_tax_attributes.ndjson` (~220K, full address strings)

These are intermediate artifacts — gitignored. The DB becomes the durable copy
once Step 2 runs.

## Step 2 — Load into geocode_index (~3 min)

Joins layers 0/3/4 on `parcel_number`, normalizes addresses, and inserts into
`public.geocode_index` with `source = 'polk_county_ia_atlas'`. Idempotent
(`ON CONFLICT (source, source_hash) DO NOTHING`).

```bash
OUT_DIR=./tmp/polk-snapshot \
POSTGRES_URL_NON_POOLING="$YOUR_SUPABASE_URL" \
npx tsx scripts/load-polk-county-into-index.ts
```

Will insert ~172,500 rows. Re-running is safe — duplicates are skipped.

## Step 3 — Re-run the geocode cron

Once loaded, hit the cron endpoint to start matching the previously-stranded
Polk County customers:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://app.beisser.cloud/api/cron/geocode-nightly
```

## Alternative — generate SQL chunks (if direct DB access isn't available)

If you can't run the loader script, build batched INSERT chunks instead:

```bash
OUT_DIR=./tmp/polk-snapshot npx tsx scripts/build-polk-load-sql.ts
```

Creates ~173 SQL files in `./tmp/polk-snapshot/sql/chunk_*.sql`, each with
1,000 rows. Apply via Supabase SQL editor or psql one at a time.

## Files

- `scripts/snapshot-polk-county-atlas.ts` — pulls atlas → NDJSON
- `scripts/load-polk-county-into-index.ts` — NDJSON → DB (postgres-js direct)
- `scripts/build-polk-load-sql.ts` — NDJSON → SQL chunks (no DB connection
  needed; output applied manually)

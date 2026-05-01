/**
 * Load the Polk County IA atlas snapshot into public.geocode_index.
 *
 * Prereq: run `scripts/snapshot-polk-county-atlas.ts` first to produce the
 * NDJSON files in $OUT_DIR (default ./tmp/polk-snapshot).
 *
 * Strategy:
 *   1. Read Layer 4 (ParcelTaxAttributes) → for each parcel_number, parse the
 *      `PrimarySitus` JSON to get a structured address (street #, name, type,
 *      directions, city, zip).
 *   2. Read Layer 0 (Tax Parcel Points) → exact point coords per
 *      parcel_number. Best for condos / apartment units.
 *   3. Read Layer 3 (Tax Parcels) → polygon. Compute centroid client-side as
 *      the parcel's lat/lon. Fallback when no Layer 0 point exists.
 *   4. Join: prefer Layer 0 point; fall back to Layer 3 centroid.
 *   5. Normalize via the same `normalizeAddress`-style rules used by the
 *      OpenAddresses loader so the matcher hits exact-match.
 *   6. Insert into geocode_index in batches of 5,000 with
 *      source='polk_county_ia_atlas' and source_hash=parcel_number.
 *      ON CONFLICT (source, source_hash) DO NOTHING so re-runs are idempotent.
 *
 * Run:
 *   POSTGRES_URL_NON_POOLING=... npx tsx scripts/load-polk-county-into-index.ts
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import postgres from 'postgres';
import { normalizeAddress } from '../src/lib/geocode';

const OUT_DIR = process.env.OUT_DIR || './tmp/polk-snapshot';
const SOURCE_TAG = 'polk_county_ia_atlas';
const BATCH_SIZE = 5000;

interface PrimarySitus {
  StreetNumber: string;
  PreDirection: string;
  Name: string;
  Type: string;
  PostDirection: string;
  HouseFraction: string;
  UnitType: string;
  Unit: string;
  CityName: string;
  StateName: string;
  PostalCode: string;
  FullAddress: string;
}

interface ParcelAddress {
  parcel_number: string;
  situs: PrimarySitus;
}

interface ParcelPoint {
  parcel_number: string;
  lat: number;
  lon: number;
}

async function* readNdjson<T>(path: string): AsyncGenerator<T> {
  const stream = createReadStream(path);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as T;
  }
}

function polygonCentroid(rings: number[][][]): { lat: number; lon: number } | null {
  if (!rings || rings.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  let n = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        sumX += x;
        sumY += y;
        n++;
      }
    }
  }
  if (n === 0) return null;
  return { lat: sumY / n, lon: sumX / n };
}

function buildStreetNorm(s: PrimarySitus): string {
  // Atlas already returns abbreviated tokens (NE, AVE, etc.), but we still run
  // through normalizeAddress() as the source of truth so loader/matcher agree.
  // Reconstruct as "12181 NE UNIVERSITY AVE" then ask the normalizer.
  const parts = [
    s.StreetNumber,
    s.PreDirection,
    s.Name,
    s.Type,
    s.PostDirection,
  ]
    .map((p) => (p ?? '').toString().trim())
    .filter(Boolean);
  const joined = parts.join(' ');
  const norm = normalizeAddress(joined);
  if (!norm) return '';
  return norm.street_norm;
}

async function main() {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.BIDS_DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'Set POSTGRES_URL_NON_POOLING or BIDS_DATABASE_URL or POSTGRES_URL',
    );
  }
  const sql = postgres(url, { prepare: false, max: 1 });

  // ── Pass 1: load Layer 4 addresses into a Map ───────────────────────────
  console.log('Pass 1: reading layer4 (parcel tax attributes)...');
  const addrByParcel = new Map<string, PrimarySitus>();
  let layer4Total = 0;
  let layer4WithSitus = 0;
  for await (const row of readNdjson<{ attributes: { Parcel_Number: string; PrimarySitus: string | null } }>(
    join(OUT_DIR, 'layer4_parcel_tax_attributes.ndjson'),
  )) {
    layer4Total++;
    const parcel = row.attributes.Parcel_Number?.toString().trim();
    const psRaw = row.attributes.PrimarySitus;
    if (!parcel || !psRaw) continue;
    let situs: PrimarySitus;
    try {
      situs = JSON.parse(psRaw);
    } catch {
      continue;
    }
    if (!situs.StreetNumber || !situs.Name || !situs.CityName) continue;
    addrByParcel.set(parcel, situs);
    layer4WithSitus++;
  }
  console.log(
    `  ${layer4Total.toLocaleString()} rows; ${layer4WithSitus.toLocaleString()} with parseable PrimarySitus`,
  );

  // ── Pass 2: load Layer 0 exact points ───────────────────────────────────
  console.log('Pass 2: reading layer0 (apartment unit points)...');
  const pointByParcel = new Map<string, { lat: number; lon: number }>();
  for await (const row of readNdjson<{
    attributes: { parcel_number: string };
    geometry?: { x: number; y: number };
  }>(join(OUT_DIR, 'layer0_tax_parcel_points.ndjson'))) {
    const parcel = row.attributes.parcel_number?.toString().trim();
    if (!parcel || !row.geometry) continue;
    const { x, y } = row.geometry;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pointByParcel.set(parcel, { lat: y, lon: x });
  }
  console.log(`  ${pointByParcel.size.toLocaleString()} unit points`);

  // ── Pass 3: stream Layer 3 polygons, compute centroid, build inserts ────
  console.log('Pass 3: streaming layer3 polygons + inserting...');
  type IndexRow = {
    number_norm: string;
    street_norm: string;
    city_norm: string;
    state_norm: string;
    postcode: string | null;
    number_raw: string;
    street_raw: string;
    unit: string | null;
    city_raw: string;
    lat: number;
    lon: number;
    source: string;
    source_hash: string;
  };

  let batch: IndexRow[] = [];
  let inserted = 0;
  let skipped = 0;
  let polygonsRead = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    const result = await sql`
      INSERT INTO public.geocode_index ${sql(
        rows,
        'number_norm',
        'street_norm',
        'city_norm',
        'state_norm',
        'postcode',
        'number_raw',
        'street_raw',
        'unit',
        'city_raw',
        'lat',
        'lon',
        'source',
        'source_hash',
      )}
      ON CONFLICT (source, source_hash) WHERE source IS NOT NULL AND source_hash IS NOT NULL DO NOTHING
    `;
    inserted += result.count ?? 0;
  };

  for await (const row of readNdjson<{
    attributes: { Parcel_Number: string };
    geometry?: { rings?: number[][][] };
  }>(join(OUT_DIR, 'layer3_tax_parcels.ndjson'))) {
    polygonsRead++;
    const parcel = row.attributes.Parcel_Number?.toString().trim();
    if (!parcel) {
      skipped++;
      continue;
    }
    const situs = addrByParcel.get(parcel);
    if (!situs) {
      skipped++;
      continue;
    }
    const point =
      pointByParcel.get(parcel) ||
      polygonCentroid(row.geometry?.rings ?? []);
    if (!point) {
      skipped++;
      continue;
    }
    const street_norm = buildStreetNorm(situs);
    if (!street_norm) {
      skipped++;
      continue;
    }
    const city_norm = situs.CityName.toUpperCase().trim();
    const state_norm = situs.StateName.toUpperCase().trim();
    const postcode = situs.PostalCode?.match(/^\d{5}/)?.[0] ?? null;
    const unit = situs.Unit?.trim() || null;

    batch.push({
      number_norm: situs.StreetNumber,
      street_norm,
      city_norm,
      state_norm,
      postcode,
      number_raw: situs.StreetNumber,
      street_raw: [
        situs.PreDirection,
        situs.Name,
        situs.Type,
        situs.PostDirection,
      ]
        .filter(Boolean)
        .join(' '),
      unit,
      city_raw: situs.CityName,
      lat: point.lat,
      lon: point.lon,
      source: SOURCE_TAG,
      source_hash: parcel,
    });

    if (batch.length >= BATCH_SIZE) {
      await flush();
      if (polygonsRead % 50000 < BATCH_SIZE) {
        console.log(
          `  ${polygonsRead.toLocaleString()} polygons read, ${inserted.toLocaleString()} inserted, ${skipped.toLocaleString()} skipped`,
        );
      }
    }
  }
  await flush();

  console.log(`\nDone.`);
  console.log(`  polygons read: ${polygonsRead.toLocaleString()}`);
  console.log(`  rows inserted: ${inserted.toLocaleString()}`);
  console.log(`  rows skipped:  ${skipped.toLocaleString()}`);

  await sql.end();
}

main().catch((err) => {
  console.error('Load failed:', err);
  process.exit(1);
});

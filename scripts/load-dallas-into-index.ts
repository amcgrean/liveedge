/**
 * Load Dallas County IA assessor parcels into public.geocode_index.
 *
 * Data:
 *   Geometry — ParcelShape.shp (Iowa State Plane South, NAD83, US Survey Feet → WGS84)
 *   Attributes — ParcelShape.txt (CSV; all address fields join on PARCELID → ParcelNumber)
 *
 * The shapefile DBF only contains PARCELID — all situs/mail address fields are in the
 * companion CSV. SitusStreetName in the CSV is truncated to 2 chars by the county's export
 * and cannot be used for matching. We use MailLine1 as the address source for parcels where
 * the mailing city+state matches the situs city+state (owner-occupied or local owner).
 *
 * Run:
 *   POSTGRES_URL_NON_POOLING=... npx tsx scripts/load-dallas-into-index.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open } from 'shapefile';
import proj4 from 'proj4';
import Papa from 'papaparse';
import postgres from 'postgres';
import { normalizeAddress } from '../src/lib/geocode';

const SHP_DIR = process.env.SHP_DIR || './tmp/dallas/GIS_data';
const SOURCE_TAG = 'dallas_county_ia_parcels';
const BATCH_SIZE = 5000;

// Iowa State Plane South, NAD83, US Survey Feet (EPSG:3418)
const IOWA_SP_SOUTH =
  '+proj=lcc +lat_1=40.6166666666667 +lat_2=41.7833333333333 +lat_0=40 +lon_0=-93.5 +x_0=500000.00001016 +y_0=0 +datum=NAD83 +units=us-ft +no_defs';

function toWGS84(x: number, y: number): { lat: number; lon: number } | null {
  try {
    const [lon, lat] = proj4(IOWA_SP_SOUTH, 'WGS84', [x, y]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    // Iowa bounding box sanity check
    if (lat < 40.3 || lat > 43.6 || lon < -96.7 || lon > -90.1) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

function ringCentroid(ring: number[][]): [number, number] | null {
  let sumX = 0;
  let sumY = 0;
  let n = 0;
  for (const vertex of ring) {
    const x = vertex[0];
    const y = vertex[1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      sumX += x;
      sumY += y;
      n++;
    }
  }
  return n > 0 ? [sumX / n, sumY / n] : null;
}

async function main() {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.BIDS_DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('Set POSTGRES_URL_NON_POOLING or BIDS_DATABASE_URL or POSTGRES_URL');
  }
  const sql = postgres(url, { prepare: false, max: 1 });

  // ── Pass 1: load CSV attributes into memory ──────────────────────────────
  const csvPath = join(SHP_DIR, 'ParcelShape.txt');
  console.log('Pass 1: reading CSV attributes...');
  const csvContent = readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    console.warn(`  CSV parse warnings: ${parsed.errors.length}`);
  }
  const attrMap = new Map<string, Record<string, string>>();
  for (const row of parsed.data) {
    const id = row.ParcelNumber?.trim();
    if (id) attrMap.set(id, row);
  }
  console.log(`  ${attrMap.size.toLocaleString()} parcels loaded`);

  // ── Pass 2: stream shapefile, join on PARCELID, build inserts ───────────
  console.log('Pass 2: streaming shapefile + inserting...');
  const shpPath = join(SHP_DIR, 'ParcelShape.shp');
  const source = await open(shpPath);

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
  let featuresRead = 0;

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

  for (;;) {
    const r = await source.read();
    if (r.done) break;
    featuresRead++;

    const props = (r.value as { properties?: Record<string, unknown> }).properties ?? {};
    const parcelId = String(props.PARCELID ?? '').trim();
    if (!parcelId) {
      skipped++;
      continue;
    }

    const attr = attrMap.get(parcelId);
    if (!attr) {
      skipped++;
      continue;
    }

    const geom = (r.value as { geometry?: { type?: string; coordinates?: number[][][] } }).geometry;
    if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.[0]) {
      skipped++;
      continue;
    }
    const c = ringCentroid(geom.coordinates[0] as number[][]);
    if (!c) {
      skipped++;
      continue;
    }
    const pt = toWGS84(c[0], c[1]);
    if (!pt) {
      skipped++;
      continue;
    }

    const situsCity = attr.SitusCityName?.trim().toUpperCase() ?? '';
    const situsState = attr.SitusStateName?.trim().toUpperCase() ?? '';
    const mailCity = attr.MailCity?.trim().toUpperCase() ?? '';
    const mailState = attr.MailState?.trim().toUpperCase() ?? '';

    // Only use mail address when it matches the situs location — gives us full street name.
    // SitusStreetName in the county export is truncated to 2 chars and unusable for matching.
    if (!situsCity || mailState !== situsState || mailCity !== situsCity) {
      skipped++;
      continue;
    }
    const addressStr = attr.MailLine1?.trim();
    if (!addressStr) {
      skipped++;
      continue;
    }

    const norm = normalizeAddress(addressStr);
    if (!norm || !norm.street_norm) {
      skipped++;
      continue;
    }

    const postcode =
      attr.SitusPostalCode?.match(/^\d{5}/)?.[0] ??
      attr.MailPostalCode?.match(/^\d{5}/)?.[0] ??
      null;

    batch.push({
      number_norm: norm.number_norm,
      street_norm: norm.street_norm,
      city_norm: situsCity,
      state_norm: situsState,
      postcode,
      number_raw: norm.number_norm,
      street_raw: addressStr,
      unit: norm.unit,
      city_raw: attr.SitusCityName?.trim() ?? situsCity,
      lat: pt.lat,
      lon: pt.lon,
      source: SOURCE_TAG,
      source_hash: parcelId,
    });

    if (batch.length >= BATCH_SIZE) {
      await flush();
      console.log(
        `  ${featuresRead.toLocaleString()} features, ${inserted.toLocaleString()} inserted, ${skipped.toLocaleString()} skipped`,
      );
    }
  }
  await flush();

  console.log('\nDone.');
  console.log(`  features read: ${featuresRead.toLocaleString()}`);
  console.log(`  rows inserted: ${inserted.toLocaleString()}`);
  console.log(`  rows skipped:  ${skipped.toLocaleString()}`);

  await sql.end();
}

main().catch((err) => {
  console.error('Load failed:', err);
  process.exit(1);
});

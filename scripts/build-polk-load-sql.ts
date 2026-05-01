/**
 * Build batched INSERT SQL files from the Polk County atlas snapshot.
 * Run AFTER scripts/snapshot-polk-county-atlas.ts.
 *
 * Output: $OUT_DIR/sql/chunk_0001.sql … (one INSERT statement, 1000 rows each)
 *
 * Usage:
 *   OUT_DIR=./tmp/polk-snapshot npx tsx scripts/build-polk-load-sql.ts
 *
 * Then each chunk is small enough to execute via the Supabase MCP
 * `execute_sql` tool (or pasted into the SQL editor).
 */
import { createReadStream, createWriteStream, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { normalizeAddress } from '../src/lib/geocode';

const OUT_DIR = process.env.OUT_DIR || './tmp/polk-snapshot';
const SOURCE_TAG = 'polk_county_ia_atlas';
const CHUNK_SIZE = 1000;

interface PrimarySitus {
  StreetNumber: string;
  PreDirection: string;
  Name: string;
  Type: string;
  PostDirection: string;
  Unit: string;
  CityName: string;
  StateName: string;
  PostalCode: string;
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
  let sumX = 0, sumY = 0, n = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        sumX += x; sumY += y; n++;
      }
    }
  }
  return n === 0 ? null : { lat: sumY / n, lon: sumX / n };
}

function buildStreetNorm(s: PrimarySitus): string {
  const parts = [s.StreetNumber, s.PreDirection, s.Name, s.Type, s.PostDirection]
    .map((p) => (p ?? '').toString().trim())
    .filter(Boolean);
  const norm = normalizeAddress(parts.join(' '));
  return norm?.street_norm || '';
}

function sqlEscape(s: string | null): string {
  if (s === null || s === undefined) return 'NULL';
  return `'${s.replace(/'/g, "''")}'`;
}

async function main() {
  const sqlDir = join(OUT_DIR, 'sql');
  mkdirSync(sqlDir, { recursive: true });
  // wipe any prior chunks
  for (const f of readdirSync(sqlDir)) {
    if (f.startsWith('chunk_') && f.endsWith('.sql')) unlinkSync(join(sqlDir, f));
  }

  console.log('Pass 1: layer4 (addresses)...');
  const addrByParcel = new Map<string, PrimarySitus>();
  for await (const row of readNdjson<{ attributes: { Parcel_Number: string; PrimarySitus: string | null } }>(
    join(OUT_DIR, 'layer4_parcel_tax_attributes.ndjson'),
  )) {
    const parcel = row.attributes.Parcel_Number?.toString().trim();
    const psRaw = row.attributes.PrimarySitus;
    if (!parcel || !psRaw) continue;
    let situs: PrimarySitus;
    try { situs = JSON.parse(psRaw); } catch { continue; }
    if (!situs.StreetNumber || !situs.Name || !situs.CityName) continue;
    addrByParcel.set(parcel, situs);
  }
  console.log(`  ${addrByParcel.size.toLocaleString()} addresses indexed`);

  console.log('Pass 2: layer0 (unit points)...');
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

  console.log('Pass 3: layer3 polygons → SQL chunks...');
  let chunkIdx = 0;
  let chunkRows = 0;
  let totalRows = 0;
  let chunkStream: ReturnType<typeof createWriteStream> | null = null;

  const startChunk = () => {
    chunkIdx++;
    const path = join(sqlDir, `chunk_${chunkIdx.toString().padStart(4, '0')}.sql`);
    chunkStream = createWriteStream(path, { encoding: 'utf8' });
    chunkStream.write(
      `INSERT INTO public.geocode_index (number_norm, street_norm, city_norm, state_norm, postcode, number_raw, street_raw, unit, city_raw, lat, lon, source, source_hash) VALUES\n`,
    );
    chunkRows = 0;
  };

  const endChunk = () => {
    if (chunkStream) {
      chunkStream.write(
        `\nON CONFLICT (source, source_hash) WHERE source IS NOT NULL AND source_hash IS NOT NULL DO NOTHING;\n`,
      );
      chunkStream.end();
      chunkStream = null;
    }
  };

  startChunk();

  for await (const row of readNdjson<{
    attributes: { Parcel_Number: string };
    geometry?: { rings?: number[][][] };
  }>(join(OUT_DIR, 'layer3_tax_parcels.ndjson'))) {
    const parcel = row.attributes.Parcel_Number?.toString().trim();
    if (!parcel) continue;
    const situs = addrByParcel.get(parcel);
    if (!situs) continue;
    const point = pointByParcel.get(parcel) || polygonCentroid(row.geometry?.rings ?? []);
    if (!point) continue;
    const street_norm = buildStreetNorm(situs);
    if (!street_norm) continue;

    const city_norm = situs.CityName.toUpperCase().trim();
    const state_norm = situs.StateName.toUpperCase().trim();
    const postcode = situs.PostalCode?.match(/^\d{5}/)?.[0] ?? null;
    const unit = situs.Unit?.trim() || null;
    const street_raw = [situs.PreDirection, situs.Name, situs.Type, situs.PostDirection]
      .filter(Boolean).join(' ');

    const valuesRow =
      `(${sqlEscape(situs.StreetNumber)},${sqlEscape(street_norm)},${sqlEscape(city_norm)},` +
      `${sqlEscape(state_norm)},${postcode === null ? 'NULL' : sqlEscape(postcode)},` +
      `${sqlEscape(situs.StreetNumber)},${sqlEscape(street_raw)},` +
      `${unit === null ? 'NULL' : sqlEscape(unit)},${sqlEscape(situs.CityName)},` +
      `${point.lat},${point.lon},${sqlEscape(SOURCE_TAG)},${sqlEscape(parcel)})`;

    if (chunkRows > 0) chunkStream!.write(',\n');
    chunkStream!.write(valuesRow);
    chunkRows++;
    totalRows++;

    if (chunkRows >= CHUNK_SIZE) {
      endChunk();
      startChunk();
    }
  }

  // close last chunk (may be empty if exactly at boundary)
  if (chunkRows > 0) {
    endChunk();
  } else if (chunkStream) {
    const stream = chunkStream as { end: () => void };
    stream.end();
    // delete empty chunk file
    const path = join(sqlDir, `chunk_${chunkIdx.toString().padStart(4, '0')}.sql`);
    if (existsSync(path)) unlinkSync(path);
    chunkIdx--;
  }

  console.log(
    `\nDone. ${totalRows.toLocaleString()} rows across ${chunkIdx} chunk files in ${sqlDir}/`,
  );
}

main().catch((err) => {
  console.error('SQL build failed:', err);
  process.exit(1);
});

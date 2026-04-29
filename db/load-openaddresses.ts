/**
 * Loads an OpenAddresses CSV into public.geocode_index.
 *
 * Usage:
 *   npx tsx db/load-openaddresses.ts <csv-path> [--state IA] [--source us-ia-statewide]
 *
 * Expects OpenAddresses CSV columns: LON, LAT, NUMBER, STREET, UNIT, CITY,
 * DISTRICT, REGION, POSTCODE, ID, HASH (case-insensitive). Empty / unparseable
 * rows are skipped. Inserts in batches of 5000 with ON CONFLICT DO NOTHING on
 * (source, source_hash) so re-runs are idempotent.
 *
 * Where to get the data:
 *   1. Visit https://batch.openaddresses.io/
 *   2. Pick the Iowa (or relevant state) collection
 *   3. Download the .zip and unpack — you'll get one CSV per source
 *   4. Either point this script at one CSV at a time, or `cat *.csv > combined.csv`
 *      first and load the whole thing
 *
 * Requires POSTGRES_URL_NON_POOLING (or BIDS_DATABASE_URL) in env.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import postgres from 'postgres';
import {
  normalizeAddress,
  normalizeCity,
  normalizeState,
  normalizeZip,
} from '../src/lib/geocode';

const CONNECTION_STRING =
  process.env.BIDS_DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL;

if (!CONNECTION_STRING) {
  console.error('ERROR: set BIDS_DATABASE_URL or POSTGRES_URL_NON_POOLING');
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('Usage: tsx db/load-openaddresses.ts <csv-path> [--state IA] [--source us-ia-statewide]');
    process.exit(1);
  }
  let state: string | null = null;
  let source: string | null = null;
  const csvPath = args[0];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--state') state = args[++i];
    else if (args[i] === '--source') source = args[++i];
  }
  return { csvPath, state, source };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

type Row = {
  number_norm: string;
  street_norm: string;
  city_norm: string | null;
  state_norm: string | null;
  postcode: string | null;
  number_raw: string;
  street_raw: string;
  unit: string | null;
  city_raw: string | null;
  lat: number;
  lon: number;
  source: string | null;
  source_hash: string | null;
};

async function main() {
  const { csvPath, state: stateOverride, source: sourceOverride } = parseArgs();
  const sql = postgres(CONNECTION_STRING!, { max: 1, prepare: false });

  console.log(`Loading ${csvPath} into geocode_index…`);
  const stream = createReadStream(csvPath);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  let colIdx: Record<string, number> = {};
  const batch: Row[] = [];
  let totalRead = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const rows = batch.splice(0, batch.length);
    const result = await sql`
      INSERT INTO public.geocode_index ${sql(rows, 'number_norm','street_norm','city_norm','state_norm','postcode','number_raw','street_raw','unit','city_raw','lat','lon','source','source_hash')}
      ON CONFLICT (source, source_hash) WHERE source IS NOT NULL AND source_hash IS NOT NULL DO NOTHING
    `;
    totalInserted += result.count ?? 0;
  };

  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = parseCsvLine(line).map((c) => c.trim().toUpperCase());
      colIdx = Object.fromEntries(header.map((c, i) => [c, i]));
      const required = ['LON','LAT','NUMBER','STREET'];
      for (const c of required) {
        if (!(c in colIdx)) {
          console.error(`ERROR: CSV missing required column ${c}`);
          process.exit(1);
        }
      }
      continue;
    }
    totalRead++;
    const cols = parseCsvLine(line);
    const lon = parseFloat(cols[colIdx.LON] ?? '');
    const lat = parseFloat(cols[colIdx.LAT] ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { totalSkipped++; continue; }
    const numberRaw = (cols[colIdx.NUMBER] ?? '').trim();
    const streetRaw = (cols[colIdx.STREET] ?? '').trim();
    if (!numberRaw || !streetRaw) { totalSkipped++; continue; }

    const norm = normalizeAddress(`${numberRaw} ${streetRaw}`);
    if (!norm) { totalSkipped++; continue; }

    const cityRaw = colIdx.CITY != null ? (cols[colIdx.CITY] ?? '').trim() : '';
    const region  = colIdx.REGION   != null ? (cols[colIdx.REGION]   ?? '').trim() : '';
    const postcode = colIdx.POSTCODE != null ? (cols[colIdx.POSTCODE] ?? '').trim() : '';
    const unit    = colIdx.UNIT     != null ? ((cols[colIdx.UNIT]     ?? '').trim() || null) : null;
    const hash    = colIdx.HASH     != null ? ((cols[colIdx.HASH]     ?? '').trim() || null) : null;

    batch.push({
      number_norm: norm.number_norm,
      street_norm: norm.street_norm,
      city_norm: normalizeCity(cityRaw),
      state_norm: normalizeState(stateOverride ?? region),
      postcode: normalizeZip(postcode),
      number_raw: numberRaw,
      street_raw: streetRaw,
      unit: norm.unit ?? unit,
      city_raw: cityRaw || null,
      lat,
      lon,
      source: sourceOverride,
      source_hash: hash,
    });

    if (batch.length >= 5000) {
      await flush();
      if (totalRead % 50000 === 0) {
        console.log(`  read=${totalRead}  inserted=${totalInserted}  skipped=${totalSkipped}`);
      }
    }
  }
  await flush();

  console.log(`Done. read=${totalRead} inserted=${totalInserted} skipped=${totalSkipped}`);
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

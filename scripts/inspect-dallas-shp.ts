/**
 * Inspect Dallas County IA shapefiles and report their schema + sample rows.
 *
 * Usage:
 *   SHP_DIR=./tmp/dallas npx tsx scripts/inspect-dallas-shp.ts
 *
 * Prints, for each .shp file in SHP_DIR:
 *   - feature count
 *   - field names + types
 *   - first 3 features (attributes only — geometry skipped for readability)
 *
 * Run this first; share the output and we'll wire the actual loader.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { open } from 'shapefile';

const SHP_DIR = process.env.SHP_DIR || './tmp/dallas';

async function inspectFile(shpPath: string) {
  const name = basename(shpPath);
  console.log(`\n=== ${name} ===`);
  let source;
  try {
    source = await open(shpPath);
  } catch (err) {
    console.error(`  ! could not open: ${(err as Error).message}`);
    return;
  }
  console.log(`  bbox: ${JSON.stringify((source as { bbox?: number[] }).bbox)}`);
  // First pass: count + collect schema from first features
  let count = 0;
  const samples: Record<string, unknown>[] = [];
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    count++;
    const props = (r.value as { properties?: Record<string, unknown> }).properties ?? {};
    if (samples.length < 3) samples.push(props);
    if (count >= 200000) break; // safety
  }
  console.log(`  feature count: ${count.toLocaleString()}`);
  if (samples.length > 0) {
    const fields = Object.keys(samples[0]);
    console.log(`  fields (${fields.length}):`);
    for (const f of fields) {
      const v = samples[0][f];
      const type = v === null ? 'null' : typeof v;
      console.log(`    ${f.padEnd(20)} ${type.padEnd(8)} sample=${JSON.stringify(v)}`);
    }
    console.log(`  --- 3 sample rows (attributes only) ---`);
    for (const s of samples) {
      console.log(`    ${JSON.stringify(s)}`);
    }
  }
}

async function main() {
  console.log(`Looking in: ${SHP_DIR}`);
  let entries: string[];
  try {
    entries = readdirSync(SHP_DIR);
  } catch (err) {
    console.error(`Could not read ${SHP_DIR}: ${(err as Error).message}`);
    process.exit(1);
  }
  const shps = entries
    .filter((f) => extname(f).toLowerCase() === '.shp')
    .map((f) => join(SHP_DIR, f))
    .filter((p) => statSync(p).isFile());
  if (shps.length === 0) {
    console.error(`No .shp files found in ${SHP_DIR}.`);
    process.exit(1);
  }
  console.log(`Found ${shps.length} .shp file(s):`);
  for (const p of shps) console.log(`  ${basename(p)}`);
  for (const p of shps) await inspectFile(p);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

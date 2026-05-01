/**
 * Snapshot Polk County IA's atlas REST endpoint to local NDJSON files.
 *
 * Why: the data lives behind a county-run ArcGIS server with no public bulk
 * download. Snapshotting now gives us insurance against the endpoint being
 * taken down, and provides the source data for loading into geocode_index.
 *
 * Run:
 *   OUT_DIR=./tmp/polk-snapshot npx tsx scripts/snapshot-polk-county-atlas.ts
 *
 * Output (NDJSON, one feature per line, in WGS84 / EPSG:4326):
 *   $OUT_DIR/layer0_tax_parcel_points.ndjson    (~12K rows, with point geom)
 *   $OUT_DIR/layer3_tax_parcels.ndjson          (~208K rows, with polygon geom)
 *   $OUT_DIR/layer4_parcel_tax_attributes.ndjson (~220K rows, table — full
 *                                                  PrimarySitus address text)
 *
 * Layer 0/3 → parcel coordinates (point or polygon centroid).
 * Layer 4   → parcel address text (PrimarySitus / AltSitus).
 * Join key  → parcel_number.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE =
  'https://atlas.polkcountyiowa.gov/server/Attribute_Query/FeatureServer';
const PAGE = 2000;

interface LayerSpec {
  id: number;
  fileName: string;
  outFields: string;
  returnGeometry: boolean;
  returnCentroid: boolean;
}

const LAYERS: LayerSpec[] = [
  {
    id: 0,
    fileName: 'layer0_tax_parcel_points.ndjson',
    outFields: 'parcel_number,HouseNo,tax_parcel_point_type',
    returnGeometry: true,
    returnCentroid: false,
  },
  {
    id: 3,
    fileName: 'layer3_tax_parcels.ndjson',
    outFields: 'Parcel_Number,HouseNo,Name',
    returnGeometry: true,
    returnCentroid: true,
  },
  {
    id: 4,
    fileName: 'layer4_parcel_tax_attributes.ndjson',
    outFields:
      'Parcel_Number,HouseNo,PrimarySitus,AltSitus,MailingAddress,Owners',
    returnGeometry: false,
    returnCentroid: false,
  },
];

async function fetchPage(
  layer: LayerSpec,
  offset: number,
): Promise<{ features: unknown[]; exceededTransferLimit: boolean }> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: layer.outFields,
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    returnGeometry: layer.returnGeometry ? 'true' : 'false',
    outSR: '4326',
    f: 'json',
    orderByFields: 'OBJECTID ASC',
  });
  if (layer.returnCentroid) params.set('returnCentroid', 'true');

  const url = `${BASE}/${layer.id}/query?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for layer ${layer.id} offset ${offset}`);
  }
  const body = (await res.json()) as {
    features?: unknown[];
    exceededTransferLimit?: boolean;
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(`API error layer ${layer.id} offset ${offset}: ${body.error.message}`);
  }
  return {
    features: body.features ?? [],
    exceededTransferLimit: !!body.exceededTransferLimit,
  };
}

async function snapshotLayer(outDir: string, layer: LayerSpec): Promise<number> {
  const path = join(outDir, layer.fileName);
  const out = createWriteStream(path, { encoding: 'utf8' });
  let offset = 0;
  let total = 0;
  let pages = 0;
  const start = Date.now();

  for (;;) {
    const { features, exceededTransferLimit } = await fetchPage(layer, offset);
    pages++;
    if (features.length === 0) break;
    for (const f of features) out.write(JSON.stringify(f) + '\n');
    total += features.length;
    if (pages % 10 === 0 || !exceededTransferLimit) {
      const rate = total / Math.max(1, (Date.now() - start) / 1000);
      console.log(
        `  layer ${layer.id} | page ${pages} | rows ${total.toLocaleString()} | ${rate.toFixed(0)}/s`,
      );
    }
    if (!exceededTransferLimit) break;
    offset += features.length;
  }

  await new Promise<void>((r) => out.end(() => r()));
  return total;
}

async function main() {
  const outDir = process.env.OUT_DIR || './tmp/polk-snapshot';
  await mkdir(outDir, { recursive: true });
  console.log(`Polk County IA atlas snapshot → ${outDir}`);
  console.log(`Source: ${BASE}\n`);

  for (const layer of LAYERS) {
    console.log(`=== Layer ${layer.id} ===`);
    const start = Date.now();
    const count = await snapshotLayer(outDir, layer);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ✓ ${count.toLocaleString()} rows in ${elapsed}s\n`);
  }

  console.log(`Done. Files in ${outDir}.`);
}

main().catch((err) => {
  console.error('Snapshot failed:', err);
  process.exit(1);
});

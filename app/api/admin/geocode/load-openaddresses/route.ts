import { NextRequest, NextResponse } from 'next/server';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import {
  normalizeAddress,
  normalizeCity,
  normalizeState,
  normalizeZip,
} from '../../../../../src/lib/geocode';

export const maxDuration = 300;

// POST /api/admin/geocode/load-openaddresses
// Body: { job_id?: number, state?: string, source?: string }
//
// Streams the OpenAddresses gzipped GeoJSON-LD source for the given job,
// parses each Feature, normalizes via the JS normalizer, and bulk-inserts
// into public.geocode_index in batches of 5000.
//
// Default job_id = 817253 (us/ia/statewide as of 2026-04-24). Find newer
// IDs by hitting `https://batch.openaddresses.io/api/data?source=us/ia/statewide`.
//
// Idempotent: ON CONFLICT (source, source_hash) DO NOTHING. Re-running will
// pick up new addresses but skip the ones already loaded.

const DEFAULT_JOB_ID = 817253;

interface LoadResult {
  job_id: number;
  source: string;
  state: string;
  total_lines: number;
  parsed: number;
  inserted: number;
  skipped: number;
  elapsed_ms: number;
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
  source: string;
  source_hash: string | null;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const jobId = parseInt(body.job_id ?? DEFAULT_JOB_ID, 10) || DEFAULT_JOB_ID;
  const state = typeof body.state === 'string' && /^[A-Z]{2}$/.test(body.state) ? body.state : 'IA';
  const sourceTag = typeof body.source === 'string' && body.source ? body.source : `openaddresses_us_ia_statewide_${jobId}`;
  const url = `https://v2.openaddresses.io/batch-prod/job/${jobId}/source.geojson.gz`;

  const start = Date.now();
  let totalLines = 0;
  let parsed = 0;
  let inserted = 0;
  let skipped = 0;

  try {
    const sql = getErpSql();

    const res = await fetch(url);
    if (!res.ok || !res.body) {
      return NextResponse.json({ error: `OpenAddresses fetch failed: ${res.status} ${res.statusText}` }, { status: 502 });
    }

    const nodeStream = Readable.fromWeb(res.body as never);
    const gunzip = createGunzip();
    nodeStream.pipe(gunzip);
    const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

    const batch: Row[] = [];

    const flush = async () => {
      if (batch.length === 0) return;
      const rows = batch.splice(0, batch.length);
      const result = await sql`
        INSERT INTO public.geocode_index ${sql(rows, 'number_norm','street_norm','city_norm','state_norm','postcode','number_raw','street_raw','unit','city_raw','lat','lon','source','source_hash')}
        ON CONFLICT (source, source_hash) WHERE source IS NOT NULL AND source_hash IS NOT NULL DO NOTHING
      `;
      inserted += result.count ?? 0;
    };

    for await (const line of rl) {
      totalLines++;
      const trimmed = line.trim();
      if (!trimmed || trimmed === '{' || trimmed === '}') continue;
      // OA emits one Feature per line for the .geojson.gz output, but trim
      // trailing commas just in case the file is wrapped as a FeatureCollection.
      const cleaned = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
      if (cleaned[0] !== '{') continue;

      let feat: { properties?: Record<string, string>; geometry?: { coordinates?: [number, number] } };
      try {
        feat = JSON.parse(cleaned);
      } catch {
        skipped++;
        continue;
      }
      const props = feat.properties ?? {};
      const coords = feat.geometry?.coordinates;
      if (!coords || coords.length < 2) { skipped++; continue; }
      const lon = coords[0];
      const lat = coords[1];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) { skipped++; continue; }

      const numberRaw = (props.number ?? '').toString().trim();
      const streetRaw = (props.street ?? '').toString().trim();
      if (!numberRaw || !streetRaw) { skipped++; continue; }

      const norm = normalizeAddress(`${numberRaw} ${streetRaw}`);
      if (!norm) { skipped++; continue; }
      parsed++;

      const cityRaw = (props.city ?? '').toString().trim();
      const region  = (props.region ?? '').toString().trim();
      const postcode = (props.postcode ?? '').toString().trim();
      const unit = ((props.unit ?? '').toString().trim() || null);
      const hash = ((props.hash ?? '').toString().trim() || null);

      batch.push({
        number_norm: norm.number_norm,
        street_norm: norm.street_norm,
        city_norm: normalizeCity(cityRaw),
        state_norm: normalizeState(region) ?? state,
        postcode: normalizeZip(postcode),
        number_raw: numberRaw,
        street_raw: streetRaw,
        unit: norm.unit ?? unit,
        city_raw: cityRaw || null,
        lat,
        lon,
        source: sourceTag,
        source_hash: hash,
      });

      if (batch.length >= 5000) {
        await flush();
      }
    }
    await flush();

    const result: LoadResult = {
      job_id: jobId,
      source: sourceTag,
      state,
      total_lines: totalLines,
      parsed,
      inserted,
      skipped,
      elapsed_ms: Date.now() - start,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[admin/geocode/load-openaddresses]', err);
    return NextResponse.json({
      error: 'Internal server error',
      detail: String(err),
      partial: { total_lines: totalLines, parsed, inserted, skipped },
    }, { status: 500 });
  }
}

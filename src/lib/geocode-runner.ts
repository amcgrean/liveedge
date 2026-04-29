/**
 * Pure geocode pipeline functions shared between:
 *   - /api/admin/geocode/run + load-openaddresses (admin-triggered)
 *   - /api/cron/geocode-nightly (scheduled overnight)
 *
 * No auth, no HTTP. Caller passes the SQL client and gets back a structured
 * result.
 */
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { getErpSql } from '../../db/supabase';
import {
  JUNK_ADDRESS_SQL_REGEX,
  normalizeAddress,
  normalizeCity,
  normalizeState,
  normalizeZip,
} from './geocode';

type Sql = ReturnType<typeof getErpSql>;

// ─── Geocode backfill ────────────────────────────────────────────────────────

export interface RunBatchResult {
  attempted: number;
  parsed: number;
  matched_city: number;
  matched_zip: number;
  matched_state_unique: number;
  unmatched: number;
  remaining_failed: number;
}

export async function runGeocodeBatch(
  sql: Sql,
  opts: { state?: string; batchSize?: number } = {},
): Promise<RunBatchResult> {
  const stateFilter = opts.state ?? 'IA';
  const batchSize = Math.min(5000, Math.max(1, opts.batchSize ?? 500));

  const candidates = await sql<{
    id: number; address_1: string; city: string | null; zip: string | null;
  }[]>`
    SELECT id, address_1, city, zip
    FROM public.agility_customers
    WHERE is_deleted = false
      AND geocode_source = 'failed'
      AND UPPER(TRIM(state)) = ${stateFilter}
      AND COALESCE(TRIM(address_1),'') <> ''
      AND address_1 ~ '[0-9]'
      AND LOWER(TRIM(address_1)) !~ ${JUNK_ADDRESS_SQL_REGEX}
    ORDER BY id
    LIMIT ${batchSize}
  `;

  type Parsed = { id: number; number: string; street: string; city: string | null; zip: string | null };
  const parsed: Parsed[] = [];
  for (const c of candidates) {
    const n = normalizeAddress(c.address_1);
    if (!n) continue;
    parsed.push({
      id: c.id,
      number: n.number_norm,
      street: n.street_norm,
      city: normalizeCity(c.city),
      zip: normalizeZip(c.zip),
    });
  }

  const counts = { matched_city: 0, matched_zip: 0, matched_state_unique: 0 };
  const matched = new Map<number, { lat: number; lon: number; source: string }>();

  if (parsed.length > 0) {
    const ids = parsed.map((p) => p.id);
    const nums = parsed.map((p) => p.number);
    const streets = parsed.map((p) => p.street);
    const cities = parsed.map((p) => p.city);

    const cityHits = await sql<{ id: number; lat: string; lon: string }[]>`
      WITH inputs AS (
        SELECT * FROM unnest(
          ${ids}::bigint[], ${nums}::text[], ${streets}::text[], ${cities}::text[]
        ) AS t(id, num, street, city)
      )
      SELECT DISTINCT ON (i.id) i.id, gi.lat::text, gi.lon::text
      FROM inputs i
      JOIN public.geocode_index gi
        ON gi.number_norm = i.num AND gi.street_norm = i.street AND gi.city_norm = i.city
      WHERE i.city IS NOT NULL
    `;
    for (const h of cityHits) {
      matched.set(h.id, { lat: parseFloat(h.lat), lon: parseFloat(h.lon), source: 'openaddresses_city' });
    }

    const tier2 = parsed.filter((p) => !matched.has(p.id) && p.zip);
    if (tier2.length > 0) {
      const zipHits = await sql<{ id: number; lat: string; lon: string }[]>`
        WITH inputs AS (
          SELECT * FROM unnest(
            ${tier2.map((p) => p.id)}::bigint[], ${tier2.map((p) => p.number)}::text[],
            ${tier2.map((p) => p.street)}::text[], ${tier2.map((p) => p.zip)}::text[]
          ) AS t(id, num, street, zip)
        )
        SELECT DISTINCT ON (i.id) i.id, gi.lat::text, gi.lon::text
        FROM inputs i
        JOIN public.geocode_index gi
          ON gi.number_norm = i.num AND gi.street_norm = i.street AND gi.postcode = i.zip
      `;
      for (const h of zipHits) {
        if (!matched.has(h.id)) matched.set(h.id, { lat: parseFloat(h.lat), lon: parseFloat(h.lon), source: 'openaddresses_zip' });
      }
    }

    const tier3 = parsed.filter((p) => !matched.has(p.id));
    if (tier3.length > 0) {
      const stateHits = await sql<{ id: number; lat: string; lon: string }[]>`
        WITH inputs AS (
          SELECT * FROM unnest(
            ${tier3.map((p) => p.id)}::bigint[], ${tier3.map((p) => p.number)}::text[],
            ${tier3.map((p) => p.street)}::text[]
          ) AS t(id, num, street)
        ),
        joined AS (
          SELECT i.id, gi.lat, gi.lon, COUNT(*) OVER (PARTITION BY i.id)::int AS n
          FROM inputs i
          JOIN public.geocode_index gi
            ON gi.number_norm = i.num AND gi.street_norm = i.street AND gi.state_norm = ${stateFilter}
        )
        SELECT DISTINCT ON (id) id, lat::text, lon::text FROM joined WHERE n = 1
      `;
      for (const h of stateHits) {
        if (!matched.has(h.id)) matched.set(h.id, { lat: parseFloat(h.lat), lon: parseFloat(h.lon), source: 'openaddresses_state_unique' });
      }
    }

    for (const [id, hit] of matched.entries()) {
      await sql`
        UPDATE public.agility_customers
           SET lat = ${hit.lat}, lon = ${hit.lon}, geocode_source = ${hit.source}, geocoded_at = NOW()
         WHERE id = ${id}
      `;
      if (hit.source === 'openaddresses_city')               counts.matched_city++;
      else if (hit.source === 'openaddresses_zip')             counts.matched_zip++;
      else if (hit.source === 'openaddresses_state_unique')   counts.matched_state_unique++;
    }
  }

  const [{ remaining }] = await sql<{ remaining: number }[]>`
    SELECT COUNT(*)::int AS remaining
    FROM public.agility_customers
    WHERE is_deleted = false AND geocode_source = 'failed'
      AND UPPER(TRIM(state)) = ${stateFilter}
      AND COALESCE(TRIM(address_1),'') <> ''
      AND address_1 ~ '[0-9]'
      AND LOWER(TRIM(address_1)) !~ ${JUNK_ADDRESS_SQL_REGEX}
  `;

  return {
    attempted: candidates.length,
    parsed: parsed.length,
    matched_city: counts.matched_city,
    matched_zip: counts.matched_zip,
    matched_state_unique: counts.matched_state_unique,
    unmatched: parsed.length - matched.size,
    remaining_failed: remaining,
  };
}

// ─── OpenAddresses loader ────────────────────────────────────────────────────

export interface LoadOpenAddressesResult {
  job_id: number;
  source: string;
  state: string;
  total_lines: number;
  parsed: number;
  inserted: number;
  skipped: number;
  elapsed_ms: number;
}

export const DEFAULT_IA_JOB_ID = 817253;

export async function loadOpenAddresses(
  sql: Sql,
  opts: { jobId?: number; state?: string; sourceTag?: string; deadlineMs?: number } = {},
): Promise<LoadOpenAddressesResult> {
  const jobId = opts.jobId ?? DEFAULT_IA_JOB_ID;
  const state = opts.state ?? 'IA';
  const sourceTag = opts.sourceTag ?? `openaddresses_us_ia_statewide_${jobId}`;
  const url = `https://v2.openaddresses.io/batch-prod/job/${jobId}/source.geojson.gz`;
  const start = Date.now();
  const deadline = opts.deadlineMs ? start + opts.deadlineMs : Infinity;

  let totalLines = 0;
  let parsed = 0;
  let inserted = 0;
  let skipped = 0;

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`OpenAddresses fetch failed: ${res.status} ${res.statusText}`);
  }

  const nodeStream = Readable.fromWeb(res.body as never);
  const gunzip = createGunzip();
  nodeStream.pipe(gunzip);
  const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

  type Row = {
    number_norm: string; street_norm: string; city_norm: string | null;
    state_norm: string | null; postcode: string | null; number_raw: string;
    street_raw: string; unit: string | null; city_raw: string | null;
    lat: number; lon: number; source: string; source_hash: string | null;
  };
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
    if (Date.now() > deadline) {
      // Soft-stop on deadline so the cron stays under Vercel's 300s timeout.
      // Re-running picks up via ON CONFLICT (source, source_hash).
      rl.close();
      break;
    }
    totalLines++;
    const trimmed = line.trim();
    if (!trimmed || trimmed === '{' || trimmed === '}') continue;
    const cleaned = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
    if (cleaned[0] !== '{') continue;

    let feat: { properties?: Record<string, string>; geometry?: { coordinates?: [number, number] } };
    try { feat = JSON.parse(cleaned); } catch { skipped++; continue; }
    const props = feat.properties ?? {};
    const coords = feat.geometry?.coordinates;
    if (!coords || coords.length < 2) { skipped++; continue; }
    const lon = coords[0]; const lat = coords[1];
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
      number_norm: norm.number_norm, street_norm: norm.street_norm,
      city_norm: normalizeCity(cityRaw), state_norm: normalizeState(region) ?? state,
      postcode: normalizeZip(postcode), number_raw: numberRaw, street_raw: streetRaw,
      unit: norm.unit ?? unit, city_raw: cityRaw || null, lat, lon, source: sourceTag,
      source_hash: hash,
    });

    if (batch.length >= 5000) await flush();
  }
  await flush();

  return { job_id: jobId, source: sourceTag, state, total_lines: totalLines, parsed, inserted, skipped, elapsed_ms: Date.now() - start };
}

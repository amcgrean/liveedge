import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import {
  JUNK_ADDRESS_SQL_REGEX,
  normalizeAddress,
  normalizeCity,
  normalizeZip,
} from '../../../../../src/lib/geocode';

// POST /api/admin/geocode/run
// Body: { batch_size?: number, state?: string }
//
// Picks rows from agility_customers where geocode_source='failed' and
// shipto_address_1 looks like a real address, parses + normalizes them in JS,
// then matches against public.geocode_index. Writes lat/lon back on hit.

interface RunResult {
  attempted: number;
  parsed: number;
  matched_city: number;
  matched_zip: number;
  matched_state_unique: number;
  unmatched: number;
  remaining_failed: number;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(5000, Math.max(1, parseInt(body.batch_size ?? '500', 10) || 500));
  const stateFilter = typeof body.state === 'string' && /^[A-Z]{2}$/.test(body.state) ? body.state : 'IA';

  try {
    const sql = getErpSql();

    const [{ total: indexSize }] = await sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM public.geocode_index WHERE state_norm = ${stateFilter}
    `;
    if (indexSize === 0) {
      return NextResponse.json({
        error: `geocode_index is empty for state=${stateFilter}. Load OpenAddresses data first via db/load-openaddresses.ts.`,
      }, { status: 412 });
    }

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

    // Parse + normalize in JS (single source of truth). Drop unparseable rows.
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
    if (parsed.length === 0) {
      return NextResponse.json({
        attempted: candidates.length,
        parsed: 0,
        matched_city: 0,
        matched_zip: 0,
        matched_state_unique: 0,
        unmatched: candidates.length,
        remaining_failed: -1,
      });
    }

    // Tier 1: number + street + city
    const ids = parsed.map((p) => p.id);
    const nums = parsed.map((p) => p.number);
    const streets = parsed.map((p) => p.street);
    const cities = parsed.map((p) => p.city);
    const zips = parsed.map((p) => p.zip);

    const cityHits = await sql<{ id: number; lat: string; lon: string }[]>`
      WITH inputs AS (
        SELECT *
        FROM unnest(
          ${ids}::bigint[],
          ${nums}::text[],
          ${streets}::text[],
          ${cities}::text[]
        ) AS t(id, num, street, city)
      )
      SELECT DISTINCT ON (i.id) i.id, gi.lat::text, gi.lon::text
      FROM inputs i
      JOIN public.geocode_index gi
        ON gi.number_norm = i.num
        AND gi.street_norm = i.street
        AND gi.city_norm = i.city
      WHERE i.city IS NOT NULL
    `;

    const matched = new Map<number, { lat: number; lon: number; source: string }>();
    for (const h of cityHits) {
      matched.set(h.id, { lat: parseFloat(h.lat), lon: parseFloat(h.lon), source: 'openaddresses_city' });
    }

    // Tier 2: number + street + zip (for rows not matched in tier 1)
    const tier2 = parsed.filter((p) => !matched.has(p.id) && p.zip);
    if (tier2.length > 0) {
      const zipHits = await sql<{ id: number; lat: string; lon: string }[]>`
        WITH inputs AS (
          SELECT *
          FROM unnest(
            ${tier2.map((p) => p.id)}::bigint[],
            ${tier2.map((p) => p.number)}::text[],
            ${tier2.map((p) => p.street)}::text[],
            ${tier2.map((p) => p.zip)}::text[]
          ) AS t(id, num, street, zip)
        )
        SELECT DISTINCT ON (i.id) i.id, gi.lat::text, gi.lon::text
        FROM inputs i
        JOIN public.geocode_index gi
          ON gi.number_norm = i.num
          AND gi.street_norm = i.street
          AND gi.postcode = i.zip
      `;
      for (const h of zipHits) {
        if (matched.has(h.id)) continue;
        matched.set(h.id, { lat: parseFloat(h.lat), lon: parseFloat(h.lon), source: 'openaddresses_zip' });
      }
    }

    // Tier 3: number + street + state — but only when exactly one match
    const tier3 = parsed.filter((p) => !matched.has(p.id));
    if (tier3.length > 0) {
      const stateHits = await sql<{ id: number; lat: string; lon: string; n: number }[]>`
        WITH inputs AS (
          SELECT *
          FROM unnest(
            ${tier3.map((p) => p.id)}::bigint[],
            ${tier3.map((p) => p.number)}::text[],
            ${tier3.map((p) => p.street)}::text[]
          ) AS t(id, num, street)
        ),
        joined AS (
          SELECT i.id, gi.lat, gi.lon, COUNT(*) OVER (PARTITION BY i.id)::int AS n
          FROM inputs i
          JOIN public.geocode_index gi
            ON gi.number_norm = i.num
            AND gi.street_norm = i.street
            AND gi.state_norm = ${stateFilter}
        )
        SELECT DISTINCT ON (id) id, lat::text, lon::text, n FROM joined WHERE n = 1
      `;
      for (const h of stateHits) {
        if (matched.has(h.id)) continue;
        matched.set(h.id, { lat: parseFloat(h.lat), lon: parseFloat(h.lon), source: 'openaddresses_state_unique' });
      }
    }

    // Apply updates in a single query per source bucket
    const counts = { matched_city: 0, matched_zip: 0, matched_state_unique: 0 };
    for (const [id, hit] of matched.entries()) {
      await sql`
        UPDATE public.agility_customers
           SET lat = ${hit.lat}, lon = ${hit.lon}, geocode_source = ${hit.source}, geocoded_at = NOW()
         WHERE id = ${id}
      `;
      if (hit.source === 'openaddresses_city')          counts.matched_city++;
      else if (hit.source === 'openaddresses_zip')       counts.matched_zip++;
      else if (hit.source === 'openaddresses_state_unique') counts.matched_state_unique++;
    }

    const [{ remaining }] = await sql<{ remaining: number }[]>`
      SELECT COUNT(*)::int AS remaining
      FROM public.agility_customers
      WHERE is_deleted = false
        AND geocode_source = 'failed'
        AND UPPER(TRIM(state)) = ${stateFilter}
        AND COALESCE(TRIM(address_1),'') <> ''
        AND address_1 ~ '[0-9]'
        AND LOWER(TRIM(address_1)) !~ ${JUNK_ADDRESS_SQL_REGEX}
    `;

    const result: RunResult = {
      attempted: candidates.length,
      parsed: parsed.length,
      matched_city: counts.matched_city,
      matched_zip: counts.matched_zip,
      matched_state_unique: counts.matched_state_unique,
      unmatched: parsed.length - matched.size,
      remaining_failed: remaining,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('[admin/geocode/run]', err);
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 });
  }
}

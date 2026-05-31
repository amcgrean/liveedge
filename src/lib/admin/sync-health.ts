// Shared freshness computation for the Pi → Supabase ERP sync and the analytics
// rollups (Tier 1 of the architecture review). Used by:
//   - GET /api/admin/sync-health        (admin dashboard view)
//   - GET /api/cron/sync-health-alert   (daily staleness alert email)
//
// Deliberately cheap — never a buffer-cache offender:
//   - customer_scorecard_fact freshness uses MAX(synced_at) (indexed → index scan).
//   - rollup freshness comes from cron.job_run_details (cheap).
//   - operational agility_* tables: only pg_class.reltuples row counts (no scan);
//     they don't index synced_at, so we don't MAX() them.

import { getErpSql } from '../../../db/supabase';

export const STALE_AFTER_HOURS = 26; // daily sync + a margin

// Operational tables we surface a ballpark row count for (reltuples — cheap).
const WATCH_TABLES = [
  'agility_so_header',
  'agility_so_lines',
  'agility_shipments',
  'agility_picks',
  'agility_po_header',
  'agility_customers',
  'agility_item_branch',
];

// Each analytics rollup + the pg_cron job that refreshes it.
const ROLLUPS: { name: string; jobName: string }[] = [
  { name: 'bids.rollup_customer_day', jobName: 'refresh_rollup_customer_day' },
  { name: 'bids.rollup_product_day', jobName: 'refresh_rollup_product_day' },
  { name: 'bids.rollup_saletype_day', jobName: 'refresh_rollup_saletype_day' },
];

export interface RollupHealth {
  name: string;
  approxRows: string | null;
  lastRefreshAt: string | null;
  lastRefreshStatus: string | null;
  ageHours: number | null;
  stale: boolean;
}

export interface SyncHealth {
  generatedAt: string;
  thresholds: { staleAfterHours: number };
  scorecardFact: {
    lastSyncedAt: string | null;
    lastSourceUpdatedAt: string | null;
    approxRows: string | null;
    ageHours: number | null;
    stale: boolean;
  };
  rollups: RollupHealth[];
  watchTables: { name: string; approxRows: string | null }[];
  issues: string[]; // human-readable; empty ⇒ healthy
  healthy: boolean;
}

function ageHours(ts: string | Date | null): number | null {
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export async function computeSyncHealth(): Promise<SyncHealth> {
  const sql = getErpSql();

  // --- Scorecard fact freshness (indexed MAX — cheap) ---
  const [fact] = await sql<{ last_synced: string | null; last_source: string | null }[]>`
    SELECT MAX(synced_at) AS last_synced, MAX(source_updated_at) AS last_source
    FROM public.customer_scorecard_fact
  `;
  const [factRows] = await sql<{ approx_rows: string | null }[]>`
    SELECT reltuples::bigint::text AS approx_rows
    FROM pg_class WHERE oid = 'public.customer_scorecard_fact'::regclass
  `;

  // --- Operational table row sanity (reltuples — cheap, no scan) ---
  const watch = await sql<{ table_name: string; approx_rows: string | null }[]>`
    SELECT c.relname AS table_name, c.reltuples::bigint::text AS approx_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY(${WATCH_TABLES}::text[])
  `;

  // --- Each rollup MV: row count (reltuples) + last cron refresh ---
  const rollups: RollupHealth[] = [];
  for (const { name, jobName } of ROLLUPS) {
    const [rows] = await sql<{ approx_rows: string | null }[]>`
      SELECT reltuples::bigint::text AS approx_rows
      FROM pg_class WHERE oid = ${name}::regclass
    `.catch(() => [{ approx_rows: null }]);

    let refresh: { status: string | null; end_time: string | null } = { status: null, end_time: null };
    try {
      const [row] = await sql<{ status: string | null; end_time: string | null }[]>`
        SELECT d.status, d.end_time
        FROM cron.job_run_details d
        JOIN cron.job j ON j.jobid = d.jobid
        WHERE j.jobname = ${jobName}
        ORDER BY d.start_time DESC
        LIMIT 1
      `;
      if (row) refresh = row;
    } catch {
      // pg_cron history not readable here — leave nulls.
    }

    const age = ageHours(refresh.end_time);
    // Stale when we can't see a recent successful refresh, or the last one failed.
    const failed = refresh.status !== null && refresh.status !== 'succeeded';
    const stale = age === null ? true : age > STALE_AFTER_HOURS || failed;
    rollups.push({
      name,
      approxRows: rows?.approx_rows ?? null,
      lastRefreshAt: refresh.end_time,
      lastRefreshStatus: refresh.status,
      ageHours: age,
      stale,
    });
  }

  const factSyncAge = ageHours(fact?.last_synced ?? null);
  const factStale = factSyncAge === null ? true : factSyncAge > STALE_AFTER_HOURS;

  // --- Roll up into a human-readable issue list ---
  const issues: string[] = [];
  if (factStale) {
    issues.push(
      factSyncAge === null
        ? 'customer_scorecard_fact has no synced_at — Pi sync may have never run.'
        : `customer_scorecard_fact last synced ${factSyncAge}h ago (> ${STALE_AFTER_HOURS}h).`,
    );
  }
  for (const r of rollups) {
    if (!r.stale) continue;
    if (r.ageHours === null) {
      issues.push(`${r.name}: no refresh history visible.`);
    } else if (r.lastRefreshStatus !== null && r.lastRefreshStatus !== 'succeeded') {
      issues.push(`${r.name}: last refresh ${r.lastRefreshStatus} (${r.ageHours}h ago).`);
    } else {
      issues.push(`${r.name}: last refreshed ${r.ageHours}h ago (> ${STALE_AFTER_HOURS}h).`);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    thresholds: { staleAfterHours: STALE_AFTER_HOURS },
    scorecardFact: {
      lastSyncedAt: fact?.last_synced ?? null,
      lastSourceUpdatedAt: fact?.last_source ?? null,
      approxRows: factRows?.approx_rows ?? null,
      ageHours: factSyncAge,
      stale: factStale,
    },
    rollups,
    watchTables: watch.map((w) => ({ name: w.table_name, approxRows: w.approx_rows })),
    issues,
    healthy: issues.length === 0,
  };
}

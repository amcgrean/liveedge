import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/admin/sync-health
// Lightweight freshness monitor for the Pi → Supabase ERP sync and the
// analytics rollups (Tier 1 of the architecture review). Surfaces "is the data
// stale?" without itself becoming a buffer-cache offender:
//   - customer_scorecard_fact freshness uses MAX(synced_at)/MAX(source_updated_at),
//     both of which are indexed (ix_customer_scorecard_fact_{synced_at,source_updated_at})
//     so the MAX is an index scan, not a heap scan.
//   - rollup freshness comes from cron.job_run_details (cheap).
//   - operational agility_* tables don't index synced_at, so we deliberately do
//     NOT MAX() them — we only show approximate row counts via pg_class.reltuples
//     (sub-millisecond, no scan). Per-table freshness for those would need
//     synced_at indexes first (follow-up).

const STALE_AFTER_HOURS = 26; // daily sync + a margin

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

function ageHours(ts: string | Date | null): number | null {
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export async function GET() {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  try {
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

    // --- Rollup MV: row count (reltuples) + last cron refresh ---
    const [rollupRows] = await sql<{ approx_rows: string | null }[]>`
      SELECT reltuples::bigint::text AS approx_rows
      FROM pg_class WHERE oid = 'bids.rollup_customer_day'::regclass
    `.catch(() => [{ approx_rows: null }]);

    // cron.job_run_details may be inaccessible in some environments — degrade.
    let rollupRefresh: { status: string | null; end_time: string | null } = {
      status: null,
      end_time: null,
    };
    try {
      const [row] = await sql<{ status: string | null; end_time: string | null }[]>`
        SELECT d.status, d.end_time
        FROM cron.job_run_details d
        JOIN cron.job j ON j.jobid = d.jobid
        WHERE j.jobname = 'refresh_rollup_customer_day'
        ORDER BY d.start_time DESC
        LIMIT 1
      `;
      if (row) rollupRefresh = row;
    } catch {
      // pg_cron history not readable here — leave nulls.
    }

    const factSyncAge = ageHours(fact?.last_synced ?? null);
    const rollupAge = ageHours(rollupRefresh.end_time);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      thresholds: { staleAfterHours: STALE_AFTER_HOURS },
      scorecardFact: {
        lastSyncedAt: fact?.last_synced ?? null,
        lastSourceUpdatedAt: fact?.last_source ?? null,
        approxRows: factRows?.approx_rows ?? null,
        ageHours: factSyncAge,
        stale: factSyncAge === null ? true : factSyncAge > STALE_AFTER_HOURS,
      },
      rollups: [
        {
          name: 'bids.rollup_customer_day',
          approxRows: rollupRows?.approx_rows ?? null,
          lastRefreshAt: rollupRefresh.end_time,
          lastRefreshStatus: rollupRefresh.status,
          ageHours: rollupAge,
          stale: rollupAge === null ? true : rollupAge > STALE_AFTER_HOURS,
        },
      ],
      watchTables: watch.map((w) => ({ name: w.table_name, approxRows: w.approx_rows })),
    });
  } catch (err) {
    console.error('[admin/sync-health GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';
import type { HorizonKey } from '../../../../../src/lib/forecast/types';

// GET /api/management/forecast/drill?bucket=<bucket>&branch=<code>
//
// Returns the SO list backing a given KPI / horizon tile on /management/forecast.
// Supported bucket values:
//   - 'open'                  — every open SO (matches KPI "Open Orders" tile)
//   - 'far_future_unscheduled'— union of far_future + unscheduled (KPI "No-Date" tile)
//   - 'overdue' | 'next_7' | 'next_8_30' | 'next_31_90'
//     | 'next_91_plus' | 'far_future' | 'unscheduled'  — single horizon bucket
//
// Sorts by unshipped_value DESC. Capped at 200 rows so the modal stays light.

export type DrillBucket =
  | 'open'
  | 'far_future_unscheduled'
  | HorizonKey;

export interface DrillOrder {
  so_id: string;
  system_id: string;
  so_status: string | null;
  sale_type: string | null;
  cust_name: string | null;
  cust_code: string | null;
  rep_1: string | null;
  expect_date: string | null;
  ordered_value: number;
  unshipped_value: number;
}

const ALL_BUCKETS: DrillBucket[] = [
  'open',
  'far_future_unscheduled',
  'overdue',
  'next_7',
  'next_8_30',
  'next_31_90',
  'next_91_plus',
  'far_future',
  'unscheduled',
];

export async function GET(req: NextRequest) {
  const authResult = await requireCapability('branch.all');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = req.nextUrl;
  const rawBucket = (searchParams.get('bucket') ?? 'open') as DrillBucket;
  const bucket: DrillBucket = ALL_BUCKETS.includes(rawBucket) ? rawBucket : 'open';
  const branch = searchParams.get('branch') ?? '';

  // Bucket-specific date predicate. SQL fragment built via the same sql`` tag
  // so it slots into the main query without string concatenation.
  const sql = getErpSql();
  const dateFilter = (() => {
    switch (bucket) {
      case 'open':
        return sql``;
      case 'far_future_unscheduled':
        return sql`AND (soh.expect_date IS NULL OR soh.expect_date::date > CURRENT_DATE + INTERVAL '2 years')`;
      case 'overdue':
        return sql`AND soh.expect_date IS NOT NULL AND soh.expect_date::date < CURRENT_DATE`;
      case 'next_7':
        return sql`AND soh.expect_date IS NOT NULL AND soh.expect_date::date >= CURRENT_DATE AND soh.expect_date::date < CURRENT_DATE + 7`;
      case 'next_8_30':
        return sql`AND soh.expect_date IS NOT NULL AND soh.expect_date::date >= CURRENT_DATE + 7 AND soh.expect_date::date < CURRENT_DATE + 31`;
      case 'next_31_90':
        return sql`AND soh.expect_date IS NOT NULL AND soh.expect_date::date >= CURRENT_DATE + 31 AND soh.expect_date::date < CURRENT_DATE + 91`;
      case 'next_91_plus':
        return sql`AND soh.expect_date IS NOT NULL AND soh.expect_date::date >= CURRENT_DATE + 91 AND soh.expect_date::date <= CURRENT_DATE + INTERVAL '2 years'`;
      case 'far_future':
        return sql`AND soh.expect_date IS NOT NULL AND soh.expect_date::date > CURRENT_DATE + INTERVAL '2 years'`;
      case 'unscheduled':
        return sql`AND soh.expect_date IS NULL`;
      default:
        return sql``;
    }
  })();

  try {
    type Row = {
      so_id: string;
      system_id: string;
      so_status: string | null;
      sale_type: string | null;
      cust_name: string | null;
      cust_code: string | null;
      rep_1: string | null;
      expect_date: string | null;
      ordered_value: string;
      unshipped_value: string;
    };

    const rows = await sql<Row[]>`
      SELECT
        soh.so_id::text AS so_id,
        soh.system_id,
        soh.so_status,
        soh.sale_type,
        soh.cust_name,
        soh.cust_code,
        soh.rep_1,
        soh.expect_date::text AS expect_date,
        COALESCE(v.ordered_value, 0)::text   AS ordered_value,
        COALESCE(v.unshipped_value, 0)::text AS unshipped_value
      FROM agility_so_header soh
      LEFT JOIN (
        SELECT system_id, so_id,
          SUM(extended_price)           AS ordered_value,
          SUM(unshipped_extended_price) AS unshipped_value
        FROM agility_so_lines
        WHERE is_deleted = false
        GROUP BY system_id, so_id
      ) v ON v.so_id = soh.so_id AND v.system_id = soh.system_id
      WHERE soh.is_deleted = false
        AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('I', 'C', 'X')
        AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('HOLD', 'XINSTALL')
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        ${dateFilter}
      ORDER BY COALESCE(v.unshipped_value, 0) DESC NULLS LAST, soh.so_id DESC
      LIMIT 200
    `;

    const orders: DrillOrder[] = rows.map((r) => ({
      so_id: r.so_id,
      system_id: r.system_id,
      so_status: r.so_status,
      sale_type: r.sale_type,
      cust_name: r.cust_name,
      cust_code: r.cust_code,
      rep_1: r.rep_1,
      expect_date: r.expect_date,
      ordered_value: Number(r.ordered_value),
      unshipped_value: Number(r.unshipped_value),
    }));

    const res = NextResponse.json({ bucket, branch, orders, truncated: orders.length === 200 });
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return res;
  } catch (err) {
    console.error('[management/forecast/drill GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

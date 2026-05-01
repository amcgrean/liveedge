import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import { JUNK_ADDRESS_SQL_REGEX } from '../../../../../src/lib/geocode';

export interface GeocodeStatus {
  index_total: number;
  index_by_state: Array<{ state: string; rows: number }>;
  customers_total: number;
  customers_with_gps: number;
  customers_failed_legit: number;
  customers_failed_junk: number;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  try {
    const sql = getErpSql();
    const [
      [{ total: indexTotal }],
      byState,
      [counts],
    ] = await Promise.all([
      sql<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM public.geocode_index`,
      sql<{ state: string; rows: number }[]>`
        SELECT COALESCE(state_norm,'(none)') AS state, COUNT(*)::int AS rows
        FROM public.geocode_index
        GROUP BY state_norm
        ORDER BY rows DESC
      `,
      sql<{
        customers_total: number; customers_with_gps: number;
        customers_failed_legit: number; customers_failed_junk: number;
      }[]>`
        SELECT
          COUNT(*)::int                                                                    AS customers_total,
          COUNT(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL)::int                  AS customers_with_gps,
          COUNT(*) FILTER (
            WHERE geocode_source = 'failed'
              AND COALESCE(TRIM(address_1),'') <> ''
              AND address_1 ~ '[0-9]'
              AND LOWER(TRIM(address_1)) !~ ${JUNK_ADDRESS_SQL_REGEX}
          )::int                                                                           AS customers_failed_legit,
          COUNT(*) FILTER (
            WHERE geocode_source = 'failed'
              AND (
                COALESCE(TRIM(address_1),'') = ''
                OR address_1 !~ '[0-9]'
                OR LOWER(TRIM(address_1)) ~ ${JUNK_ADDRESS_SQL_REGEX}
              )
          )::int                                                                           AS customers_failed_junk
        FROM public.agility_customers
        WHERE is_deleted = false
      `,
    ]);

    const status: GeocodeStatus = {
      index_total: indexTotal,
      index_by_state: byState,
      customers_total: counts.customers_total,
      customers_with_gps: counts.customers_with_gps,
      customers_failed_legit: counts.customers_failed_legit,
      customers_failed_junk: counts.customers_failed_junk,
    };

    return NextResponse.json(status);
  } catch (err) {
    console.error('[admin/geocode/status]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

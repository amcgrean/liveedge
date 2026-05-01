import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';
import { runGeocodeBatch } from '../../../../../src/lib/geocode-runner';

export async function POST(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

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
        error: `geocode_index is empty for state=${stateFilter}. Click "Refresh Iowa Index" first.`,
      }, { status: 412 });
    }

    const result = await runGeocodeBatch(sql, { state: stateFilter, batchSize });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[admin/geocode/run]', err);
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 });
  }
}

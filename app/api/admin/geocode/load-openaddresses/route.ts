import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import { loadOpenAddresses, DEFAULT_IA_JOB_ID } from '../../../../../src/lib/geocode-runner';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const jobId = parseInt(body.job_id ?? DEFAULT_IA_JOB_ID, 10) || DEFAULT_IA_JOB_ID;
  const state = typeof body.state === 'string' && /^[A-Z]{2}$/.test(body.state) ? body.state : 'IA';
  const sourceTag = typeof body.source === 'string' && body.source ? body.source : undefined;

  try {
    const sql = getErpSql();
    const result = await loadOpenAddresses(sql, { jobId, state, sourceTag });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[admin/geocode/load-openaddresses]', err);
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 });
  }
}

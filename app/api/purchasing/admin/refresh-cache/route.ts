import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const sql = getErpSql();
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.app_po_header`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[purchasing/admin/refresh-cache]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

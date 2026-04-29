import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sql = getErpSql();

  const [saleTypes, colNames, sample] = await Promise.all([
    sql`SELECT sale_type, COUNT(*)::int AS cnt FROM agility_so_header GROUP BY sale_type ORDER BY cnt DESC LIMIT 20`,
    sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='agility_so_header' ORDER BY ordinal_position`,
    sql`SELECT so_id::text, system_id, sale_type, so_status, cust_name FROM agility_so_header WHERE UPPER(COALESCE(sale_type,'')) IN ('CM','RO','RE','CR','RM','RC') LIMIT 10`,
  ]);

  return NextResponse.json({ saleTypes, colNames, sample });
}

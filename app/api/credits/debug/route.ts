import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

export async function GET() {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const sql = getErpSql();

  const [saleTypes, colNames, sample] = await Promise.all([
    sql`SELECT sale_type, COUNT(*)::int AS cnt FROM agility_so_header GROUP BY sale_type ORDER BY cnt DESC LIMIT 20`,
    sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='agility_so_header' ORDER BY ordinal_position`,
    sql`SELECT so_id::text, system_id, sale_type, so_status, cust_name FROM agility_so_header WHERE UPPER(COALESCE(sale_type,'')) IN ('CM','RO','RE','CR','RM','RC') LIMIT 10`,
  ]);

  return NextResponse.json({ saleTypes, colNames, sample });
}

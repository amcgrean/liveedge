import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

type RouteContext = { params: Promise<{ po: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { po } = await context.params;
  const poNumber = po.trim().toUpperCase();

  try {
    const sql = getErpSql();

    const [headerRows, lineRows, receivingRows] = await Promise.all([
      sql`SELECT * FROM app_po_header WHERE po_number = ${poNumber} LIMIT 1`,
      sql`SELECT * FROM app_po_detail WHERE po_number = ${poNumber} ORDER BY line_number ASC NULLS LAST`,
      sql`SELECT * FROM app_po_receiving_summary WHERE po_number = ${poNumber} LIMIT 1`,
    ]);

    if (headerRows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      header: headerRows[0],
      lines: lineRows,
      receiving_summary: receivingRows[0] ?? null,
    });
  } catch (err) {
    console.error('[purchasing/pos/[po]]', err);
    return NextResponse.json({ error: 'ERP unavailable' }, { status: 503 });
  }
}

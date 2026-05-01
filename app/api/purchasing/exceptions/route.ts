import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/purchasing/exceptions?branch=&type=&severity=&buyer=&limit=200
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view', 'purchasing.review');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = req.nextUrl;
  const branch   = searchParams.get('branch') ?? '';
  const type     = searchParams.get('type') ?? '';
  const severity = searchParams.get('severity') ?? '';
  const buyer    = searchParams.get('buyer') ?? '';
  const limit    = Math.min(500, parseInt(searchParams.get('limit') ?? '200', 10) || 200);

  try {
    const sql = getErpSql();

    type Row = {
      event_type: string;
      event_status: string;
      system_id: string | null;
      po_number: string;
      supplier_key: string | null;
      supplier_name: string | null;
      buyer: string | null;
      severity: string;
      summary: string | null;
      event_date: string | null;
    };

    const rows = await sql<Row[]>`
      SELECT event_type, event_status, system_id, po_number,
             TRIM(supplier_key) AS supplier_key, supplier_name,
             buyer, severity, summary, event_date::text
      FROM v_purchasing_exception_events
      WHERE 1=1
        ${branch   ? sql`AND system_id = ${branch}`            : sql``}
        ${type     ? sql`AND event_type = ${type}`             : sql``}
        ${severity ? sql`AND severity = ${severity}`           : sql``}
        ${buyer    ? sql`AND LOWER(buyer) = LOWER(${buyer})`   : sql``}
      ORDER BY
        CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        event_date ASC
      LIMIT ${limit}
    `;

    // Summary counts
    const summary = {
      total:   rows.length,
      high:    rows.filter((r: Row) => r.severity === 'high').length,
      medium:  rows.filter((r: Row) => r.severity === 'medium').length,
      low:     rows.filter((r: Row) => r.severity === 'low').length,
      by_type: {
        OVERDUE_NO_RECEIPT: rows.filter((r: Row) => r.event_type === 'OVERDUE_NO_RECEIPT').length,
        SHORT_RECEIVE:      rows.filter((r: Row) => r.event_type === 'SHORT_RECEIVE').length,
        OVERDUE_PO:         rows.filter((r: Row) => r.event_type === 'OVERDUE_PO').length,
      },
      buyers: [...new Set(rows.map((r: Row) => r.buyer).filter(Boolean))].sort(),
    };

    return NextResponse.json({ exceptions: rows, summary });
  } catch (err) {
    console.error('[purchasing/exceptions GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

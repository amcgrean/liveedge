import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../../db/supabase';

type Params = Promise<{ id: string }>;

// GET /api/dispatch/routes/[id]/stops
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const authResult = await requireCapability('dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  try {
    const sql = getErpSql();
    const rows = await sql`
      SELECT s.id, s.route_id, s.so_id, s.shipment_num, s.sequence, s.status, s.notes,
             s.time_window_start, s.time_window_end, s.eta_minutes,
             s.bay_number, s.wc_notified_at::text, s.created_at
      FROM dispatch_route_stops s
      WHERE s.route_id = ${parseInt(id, 10)}
      ORDER BY s.sequence, s.id
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[dispatch/routes/[id]/stops GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/dispatch/routes/[id]/stops — add a stop
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const body = await req.json() as {
    so_id?: string;
    shipment_num?: number;
    sequence?: number;
    notes?: string;
  };

  if (!body.so_id?.trim()) {
    return NextResponse.json({ error: 'so_id is required' }, { status: 400 });
  }

  try {
    const sql = getErpSql();

    // Get next sequence if not provided
    let seq = body.sequence;
    if (!seq) {
      type SeqRow = { max_seq: number | null };
      const [seqRow] = await sql<SeqRow[]>`
        SELECT MAX(sequence) AS max_seq FROM dispatch_route_stops WHERE route_id = ${parseInt(id, 10)}
      `;
      seq = (seqRow?.max_seq ?? 0) + 10;
    }

    type InsertRow = { id: number };
    const [row] = await sql<InsertRow[]>`
      INSERT INTO dispatch_route_stops (route_id, so_id, shipment_num, sequence, status, notes, created_at)
      VALUES (${parseInt(id, 10)}, ${body.so_id.trim()}, ${body.shipment_num ?? 1},
              ${seq}, 'pending', ${body.notes?.trim() || null}, NOW())
      RETURNING id
    `;
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error('[dispatch/routes/[id]/stops POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

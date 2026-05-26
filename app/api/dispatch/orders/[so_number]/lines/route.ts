import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getErpSql } from '../../../../../../db/supabase';

export interface OrderLine {
  sequence: number | null;
  item_code: string | null;
  description: string | null;
  size: string | null;
  qty_ordered: number | null;
  qty_shipped: number | null;
  qty_on_hand: number | null;
  price: number | null;
  uom: string | null;
  handling_code: string | null;
  extended_price: number | null;
  unshipped_extended_price: number | null;
}

// GET /api/dispatch/orders/[so_number]/lines?branch=20GR
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ so_number: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { so_number } = await params;
  if (!so_number) return NextResponse.json({ error: 'so_number required' }, { status: 400 });

  const branch = req.nextUrl.searchParams.get('branch') ?? '';

  try {
    const sql = getErpSql();

    type LineRow = {
      sequence: number | null;
      item_code: string | null;
      description: string | null;
      size_: string | null;
      qty_ordered: string | null;
      qty_shipped: string | null;
      qty_on_hand: string | null;
      price: string | null;
      price_uom_ptr: string | null;
      handling_code: string | null;
      extended_price: string | null;
      unshipped_extended_price: string | null;
    };

    const rows = await sql<LineRow[]>`
      SELECT
        sol.sequence,
        sol.item_code,
        COALESCE(NULLIF(TRIM(sol.so_desc), ''), sol.description) AS description,
        sol.size_,
        sol.qty_ordered::text,
        sol.qty_shipped::text,
        aib.qty_on_hand::text,
        sol.price::text,
        sol.price_uom_ptr,
        sol.handling_code,
        sol.extended_price::text,
        sol.unshipped_extended_price::text
      FROM agility_so_lines sol
      LEFT JOIN agility_item_branch aib
        ON aib.item_code = sol.item_code
        AND aib.system_id = ${branch}
        AND aib.is_deleted = false
      WHERE sol.is_deleted = false
        AND sol.so_id::text = ${so_number}
      ORDER BY sol.sequence NULLS LAST
      LIMIT 200
    `;

    const lines: OrderLine[] = rows.map((r) => ({
      sequence: r.sequence,
      item_code: r.item_code?.trim() || null,
      description: r.description?.trim() || null,
      size: r.size_?.trim() || null,
      qty_ordered: r.qty_ordered != null ? parseFloat(r.qty_ordered) : null,
      qty_shipped: r.qty_shipped != null ? parseFloat(r.qty_shipped) : null,
      qty_on_hand: r.qty_on_hand != null ? parseFloat(r.qty_on_hand) : null,
      price: r.price != null ? parseFloat(r.price) : null,
      uom: r.price_uom_ptr?.trim() || null,
      handling_code: r.handling_code?.trim() || null,
      extended_price: r.extended_price != null ? parseFloat(r.extended_price) : null,
      unshipped_extended_price: r.unshipped_extended_price != null ? parseFloat(r.unshipped_extended_price) : null,
    }));

    return NextResponse.json({ lines });
  } catch (err) {
    console.error('[dispatch/orders/lines GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getMobileSession } from '../../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../../src/lib/access-control-shared';
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
  const session = (await getMobileSession(req)) ?? (await auth());
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { so_number } = await params;
  if (!so_number) return NextResponse.json({ error: 'so_number required' }, { status: 400 });

  const branch = req.nextUrl.searchParams.get('branch') ?? '';
  // Pricing is gated by capability so drivers and yard staff never see $.
  // Default role grants exclude this; sales/management/purchasing/estimator
  // get it (see ROLE_DEFAULTS in access-control-shared.ts).
  const canSeePricing = hasCapability(session, 'pricing.view');

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
      display_uom: string | null;
      handling_code: string | null;
      extended_price: string | null;
      unshipped_extended_price: string | null;
    };

    // JOIN agility_items.display_uom for a readable UOM ("Each" / "BF" / etc.)
    // instead of the raw price_uom_ptr FK. Fall back to price_uom_ptr only when
    // there's no item master row to read from.
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
        ai.display_uom,
        sol.handling_code,
        sol.extended_price::text,
        sol.unshipped_extended_price::text
      FROM agility_so_lines sol
      LEFT JOIN agility_item_branch aib
        ON aib.item_code = sol.item_code
        AND aib.system_id = ${branch}
        AND aib.is_deleted = false
      LEFT JOIN agility_items ai
        ON ai.item = sol.item_code
        AND ai.is_deleted = false
      WHERE sol.is_deleted = false
        AND sol.so_id::text = ${so_number}
      ORDER BY sol.sequence NULLS LAST
      LIMIT 200
    `;

    const lines: OrderLine[] = rows.map((r) => {
      const resolvedUom = r.display_uom?.trim() || r.price_uom_ptr?.trim() || null;
      // If the UOM still looks like a bare FK pointer (purely digits),
      // suppress it rather than displaying garbage.
      const cleanUom = resolvedUom && /^\d+$/.test(resolvedUom) ? null : resolvedUom;

      return {
        sequence: r.sequence,
        item_code: r.item_code?.trim() || null,
        description: r.description?.trim() || null,
        size: r.size_?.trim() || null,
        qty_ordered: r.qty_ordered != null ? parseFloat(r.qty_ordered) : null,
        qty_shipped: r.qty_shipped != null ? parseFloat(r.qty_shipped) : null,
        qty_on_hand: r.qty_on_hand != null ? parseFloat(r.qty_on_hand) : null,
        // Pricing fields are stripped to null for callers without pricing.view.
        // Doing this server-side means the bytes never reach the device — no
        // way for a curious driver to mitm or rebuild the app to see margins.
        price: canSeePricing && r.price != null ? parseFloat(r.price) : null,
        uom: cleanUom,
        handling_code: r.handling_code?.trim() || null,
        extended_price: canSeePricing && r.extended_price != null ? parseFloat(r.extended_price) : null,
        unshipped_extended_price:
          canSeePricing && r.unshipped_extended_price != null ? parseFloat(r.unshipped_extended_price) : null,
      };
    });

    return NextResponse.json({ lines, pricing_visible: canSeePricing });
  } catch (err) {
    console.error('[dispatch/orders/lines GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

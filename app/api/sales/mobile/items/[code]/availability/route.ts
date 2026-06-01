import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../../../src/lib/access-control';
import { agilityApi, isAgilityConfigured, BRANCH_MAP } from '../../../../../../../src/lib/agility-api';
import { getErpSql } from '../../../../../../../db/supabase';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

// GET /api/sales/mobile/items/[code]/availability?branch=&customer=
//
// Phase 2 overlay for the item detail screen:
//   - per-branch on-hand from the MIRROR (agility_item_branch) — always
//     available, needs no customer context.
//   - live PRICE from Agility ItemPriceAndAvailability — customer-specific, so
//     only returned when a customer context exists (?customer= or the
//     SALES_MOBILE_DEFAULT_CUSTOMER house account). priceLive=false otherwise,
//     and the mobile screen keeps the Phase 1 mirror price.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { code } = await params;
  const { searchParams } = req.nextUrl;
  const isAdmin = hasCapability(session, 'branch.all');
  const branch =
    (isAdmin ? searchParams.get('branch') : null) ?? session.user.branch ?? '20GR';
  const customer = searchParams.get('customer') ?? process.env.SALES_MOBILE_DEFAULT_CUSTOMER ?? '';

  // Per-branch on-hand from the mirror (no customer needed).
  let byBranch: { code: string; onhand: number | null }[] = [];
  try {
    const sql = getErpSql();
    type Row = { system_id: string; qty_on_hand: number | null };
    const rows = await sql<Row[]>`
      SELECT system_id, qty_on_hand::float8 AS qty_on_hand
      FROM agility_item_branch
      WHERE item_code = ${code} AND is_deleted = false
    `;
    byBranch = BRANCHES.map((b) => {
      const r = rows.find((x) => x.system_id === b);
      return { code: b, onhand: r ? r.qty_on_hand ?? 0 : null };
    });
  } catch (err) {
    console.error('[sales/mobile/items/[code]/availability mirror]', err);
  }

  // Live customer price (best-effort; only with a customer context).
  let price: number | null = null;
  let uom: string | null = null;
  let priceLive = false;
  if (isAgilityConfigured() && customer) {
    try {
      const results = await agilityApi.itemPriceAndAvailability(
        { CustomerID: customer, ShipToSequence: 1, SaleType: 'DELIVERY', Items: [{ ItemID: code, Quantity: 1 }] },
        { branch: BRANCH_MAP[branch] ?? branch },
      );
      const r = results.find((x) => x.ItemCode === code) ?? results[0];
      if (r) { price = r.NetPrice; uom = r.UOM; priceLive = true; }
    } catch (err) {
      console.error('[sales/mobile/items/[code]/availability price]', err);
    }
  }

  return NextResponse.json({ code, branch, byBranch, price, uom, priceLive, as_of: new Date().toISOString() });
}

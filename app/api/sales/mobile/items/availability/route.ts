import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../../src/lib/access-control';
import { agilityApi, isAgilityConfigured, BRANCH_MAP } from '../../../../../../src/lib/agility-api';

// GET /api/sales/mobile/items/availability?codes=a,b,c&branch=&customer=
//
// Batched live PRICE for a list of items (item-list overlay, Phase 2). One
// Agility call for up to 50 items at the user's branch. Price is customer-
// specific, so this needs a customer context (?customer= or the
// SALES_MOBILE_DEFAULT_CUSTOMER house account); without one it returns
// { configured:false } and the list keeps showing mirror on-hand only.
export async function GET(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { searchParams } = req.nextUrl;
  const codes = (searchParams.get('codes') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 50);

  const isAdmin = hasCapability(session, 'branch.all');
  const branch =
    (isAdmin ? searchParams.get('branch') : null) ?? session.user.branch ?? '20GR';
  const customer = searchParams.get('customer') ?? process.env.SALES_MOBILE_DEFAULT_CUSTOMER ?? '';

  if (codes.length === 0) return NextResponse.json({ configured: true, prices: [] });
  if (!isAgilityConfigured() || !customer) return NextResponse.json({ configured: false, prices: [] });

  try {
    const results = await agilityApi.itemPriceAndAvailability(
      { CustomerID: customer, ShipToSequence: 1, SaleType: 'DELIVERY', Items: codes.map((c) => ({ ItemID: c, Quantity: 1 })) },
      { branch: BRANCH_MAP[branch] ?? branch },
    );
    const prices = codes.map((c) => {
      const r = results.find((x) => x.ItemCode === c);
      return { code: c, price: r?.NetPrice ?? null, onhand: r?.AvailableQuantity ?? null };
    });
    return NextResponse.json({ configured: true, branch, prices, as_of: new Date().toISOString() });
  } catch (err) {
    console.error('[sales/mobile/items/availability GET]', err);
    return NextResponse.json({ error: 'Live price failed' }, { status: 503 });
  }
}

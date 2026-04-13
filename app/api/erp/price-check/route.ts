import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../src/lib/agility-api';

/**
 * POST /api/erp/price-check
 *
 * Real-time price and availability check from Agility.
 * Used by the estimating app at bid pricing time to get current prices
 * instead of relying on the stale agility_items mirror table.
 *
 * Body:
 *   customerCode:   string          — Agility customer ID
 *   shipToSequence: number          — ship-to sequence number
 *   saleType:       string          — e.g. 'DELIVERY'
 *   branchCode:     string          — e.g. '20GR'
 *   items: [
 *     { sku: string, qty: number, uom?: string }
 *   ]
 *
 * Returns: array of price/availability results per item, plus any items
 * the estimating app sent that were not found in Agility (for SKU mismatch debugging).
 */

interface PriceCheckItem {
  sku: string;
  qty: number;
  uom?: string;
}

interface PriceCheckBody {
  customerCode: string;
  shipToSequence: number;
  saleType: string;
  branchCode: string;
  items: PriceCheckItem[];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAgilityConfigured()) {
    return NextResponse.json({ error: 'Agility API not configured' }, { status: 503 });
  }

  let body: PriceCheckBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.customerCode || !body.branchCode || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: 'customerCode, branchCode, and items[] are required' },
      { status: 400 }
    );
  }

  if (body.items.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 items per price check' }, { status: 400 });
  }

  const agilityBranch = BRANCH_MAP[body.branchCode] ?? body.branchCode;

  try {
    const results = await agilityApi.itemPriceAndAvailability(
      {
        CustomerID:     body.customerCode,
        ShipToSequence: body.shipToSequence ?? 1,
        SaleType:       body.saleType ?? 'DELIVERY',
        Items: body.items.map((item) => ({
          ItemID:   item.sku,
          Quantity: item.qty,
          UOM:      item.uom,
        })),
      },
      { branch: agilityBranch }
    );

    // Build a lookup of returned items for mismatch detection
    const returnedSkus = new Set(results.map((r) => r.ItemID));
    const notFound = body.items
      .filter((item) => !returnedSkus.has(item.sku))
      .map((item) => item.sku);

    return NextResponse.json({
      success:     true,
      results,
      notFound,       // SKUs sent but not returned by Agility (likely not in their item master)
      itemCount:   results.length,
      checkedAt:   new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json({ error: `Agility: ${err.message}` }, { status: 422 });
    }
    console.error('[erp/price-check POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

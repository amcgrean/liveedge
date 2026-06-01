import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../src/lib/access-control';
import { agilityApi, isAgilityConfigured, AgilityApiError } from '../../../../../src/lib/agility-api';
import {
  writebackMode, isWriteEnabled, agilityOptions, normalizeWriteBody, type OrderCreateBody,
} from '../_writeback';

// POST /api/sales/mobile/quotes
// Create a quote in Agility from a mobile draft. Gated by
// SALES_MOBILE_WRITEBACK_MODE (disabled|test|prod) — inert until enabled.
export async function POST(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  let raw: Partial<OrderCreateBody>;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }

  const norm = normalizeWriteBody(raw);
  if ('error' in norm) return NextResponse.json({ error: norm.error }, { status: 400 });

  const isAdmin = hasCapability(session, 'branch.all');
  const branch = (isAdmin ? raw.branch : undefined) ?? session.user.branch ?? '';

  const mode = writebackMode();
  if (!isWriteEnabled(mode)) {
    return NextResponse.json({ written: false, mode, reason: 'SALES_MOBILE_WRITEBACK_MODE not enabled' });
  }
  if (!isAgilityConfigured()) {
    return NextResponse.json({ error: 'Agility API not configured' }, { status: 503 });
  }

  try {
    const result = await agilityApi.quoteCreate(
      {
        CustomerID: norm.customer,
        ShipToSequence: norm.shipToSequence,
        SaleType: norm.saleType,
        Reference: norm.reference,
        ExpirationDate: norm.expirationDate,
        Notes: norm.notes,
        Lines: norm.lines, // Price omitted — Agility applies customer pricing
      },
      agilityOptions(mode, branch),
    );
    if (!result.NewOrderID) {
      return NextResponse.json({ error: result.MessageText || 'Agility did not return a Quote ID' }, { status: 422 });
    }
    return NextResponse.json({ written: true, mode, type: 'quote', erpId: String(result.NewOrderID), linesPushed: norm.lines.length });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json({ error: `Agility: ${err.message}` }, { status: 422 });
    }
    console.error('[sales/mobile/quotes POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

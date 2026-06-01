import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../../../src/lib/access-control';
import { agilityApi, isAgilityConfigured, AgilityApiError } from '../../../../../../../src/lib/agility-api';
import { writebackMode, isWriteEnabled, agilityOptions } from '../../../_writeback';

// POST /api/sales/mobile/quotes/[id]/release
// Promote a quote to a sales order (Agility QuoteRelease). Gated by
// SALES_MOBILE_WRITEBACK_MODE (disabled|test|prod) — inert until enabled.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ERP write (promote quote → order) — gate on the high-risk write capability.
  const authResult = await requireSessionOrMobile(req, 'orders.push_to_erp');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { id } = await params;
  if (!id?.trim()) return NextResponse.json({ error: 'quote id required' }, { status: 400 });

  let branchFromBody = '';
  try {
    const body = await req.json().catch(() => ({}));
    branchFromBody = typeof body?.branch === 'string' ? body.branch : '';
  } catch { /* body optional */ }

  const isAdmin = hasCapability(session, 'branch.all');
  const branch = (isAdmin ? branchFromBody : '') || session.user.branch || '';

  const mode = writebackMode();
  if (!isWriteEnabled(mode)) {
    return NextResponse.json({ written: false, mode, reason: 'SALES_MOBILE_WRITEBACK_MODE not enabled' });
  }
  if (!isAgilityConfigured()) {
    return NextResponse.json({ error: 'Agility API not configured' }, { status: 503 });
  }

  try {
    const result = await agilityApi.quoteRelease(id.trim(), agilityOptions(mode, branch));
    if (!result.NewOrderID) {
      return NextResponse.json({ error: result.MessageText || 'Agility did not return an Order ID' }, { status: 422 });
    }
    return NextResponse.json({ written: true, mode, type: 'order', erpId: String(result.NewOrderID), fromQuote: id.trim() });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json({ error: `Agility: ${err.message}` }, { status: 422 });
    }
    console.error('[sales/mobile/quotes/[id]/release POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

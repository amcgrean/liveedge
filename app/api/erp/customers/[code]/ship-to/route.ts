import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getCustomerShipTos } from '../../../../../../src/lib/erp-sync';
import { isErpConfigured } from '../../../../../../db/supabase';

type RouteContext = { params: Promise<{ code: string }> };

/**
 * GET /api/erp/customers/:code/ship-to
 *
 * Get all ship-to addresses for an ERP customer.
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isErpConfigured()) {
    return NextResponse.json({ error: 'ERP database not configured' }, { status: 503 });
  }

  const { code } = await context.params;

  try {
    const shipTos = await getCustomerShipTos(code);
    return NextResponse.json({ shipTos });
  } catch (err) {
    console.error('[erp/customers/[code]/ship-to]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

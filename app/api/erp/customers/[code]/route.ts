import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpCustomer } from '../../../../../src/lib/erp-sync';
import { isErpConfigured } from '../../../../../db/supabase';

type RouteContext = { params: Promise<{ code: string }> };

/**
 * GET /api/erp/customers/:code
 *
 * Get ERP customer detail including balance, credit info.
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isErpConfigured()) {
    return NextResponse.json({ error: 'ERP database not configured' }, { status: 503 });
  }

  const { code } = await context.params;

  try {
    const customer = await getErpCustomer(code);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    return NextResponse.json(customer);
  } catch (err) {
    console.error('[erp/customers/[code]]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

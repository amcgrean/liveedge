import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';

// This route is superseded by /api/sales/products/majors which now returns
// product minors (the second browseable level). Kept for backwards compatibility.
export async function GET() {
  const authResult = await requireCapability('sales.view');
  if (authResult instanceof NextResponse) return authResult;
  return NextResponse.json({ minors: [], available: false });
}

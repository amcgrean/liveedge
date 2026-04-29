import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';

// This route is superseded by /api/sales/products/majors which now returns
// product minors (the second browseable level). Kept for backwards compatibility.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ minors: [], available: false });
}

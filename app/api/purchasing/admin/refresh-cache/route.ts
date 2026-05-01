import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';

export async function POST() {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  // app_po_header matview not present — purchasing routes now query agility_* tables directly
  return NextResponse.json({ ok: true });
}

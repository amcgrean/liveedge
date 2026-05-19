import { NextResponse } from 'next/server';
import { CAPABILITIES_METADATA, requireCapability } from '../../../../src/lib/access-control';

export async function GET() {
  const authResult = await requireCapability('admin.users.manage');
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({ capabilities: CAPABILITIES_METADATA });
}

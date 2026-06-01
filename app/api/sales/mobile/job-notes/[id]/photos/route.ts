import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireSessionOrMobile } from '../../../../../../../src/lib/mobile-auth';
import { getDb } from '../../../../../../../db/index';
import { salesJobNotes } from '../../../../../../../db/schema';
import { getPresignedUrl } from '../../../../../../../src/lib/r2';
import { activeScope } from '../../_shared';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await context.params;

  try {
    const [row] = await getDb()
      .select()
      .from(salesJobNotes)
      .where(activeScope(authResult, [eq(salesJobNotes.id, id)]))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const photos = await Promise.all((row.photoKeys ?? []).map(async (key) => ({ key, url: await getPresignedUrl(key, 3600) })));
    return NextResponse.json({ photos });
  } catch (err) {
    console.error('[sales/mobile/job-notes/[id]/photos GET]', err);
    return NextResponse.json({ error: 'Failed to load photos' }, { status: 500 });
  }
}

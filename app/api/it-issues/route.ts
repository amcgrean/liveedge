import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import { legacyITService } from '../../../db/schema-legacy';
import { eq, desc, ilike, and, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const status = searchParams.get('status') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const db = getDb();
    const conditions = [];
    if (q) conditions.push(ilike(legacyITService.description, `%${q}%`));
    if (status) conditions.push(eq(legacyITService.status, status));

    const rows = await db.select().from(legacyITService)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(legacyITService.createdDate))
      .limit(limit).offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyITService)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({ issues: rows, total: countResult?.count ?? 0, limit, offset });
  } catch (err) {
    console.error('[it-issues API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const issueType = body.issueType as string;
  const description = body.description as string;
  if (!issueType || !description) return NextResponse.json({ error: 'issueType and description are required' }, { status: 422 });

  try {
    const db = getDb();
    const [issue] = await db.insert(legacyITService).values({
      issueType,
      description,
      createdby: session.user.name ?? 'Unknown',
      status: 'Open',
      notes: (body.notes as string) ?? null,
    }).returning();
    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    console.error('[it-issues API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

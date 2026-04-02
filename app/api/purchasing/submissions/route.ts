import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { poSubmissions } from '../../../../db/schema';
import { and, desc, eq, gt } from 'drizzle-orm';

// POST /api/purchasing/submissions — create a check-in submission
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    po_number?: string;
    image_urls?: string[];
    image_keys?: string[];
    supplier_name?: string;
    supplier_key?: string;
    po_status?: string;
    submission_type?: string;
    priority?: string;
    notes?: string;
  };

  const poNumber = (body.po_number ?? '').trim().toUpperCase();
  if (!poNumber) return NextResponse.json({ error: 'po_number is required' }, { status: 400 });

  const imageUrls = Array.isArray(body.image_urls) ? body.image_urls : [];
  const imageKeys = Array.isArray(body.image_keys) ? body.image_keys : [];

  try {
    const db = getDb();
    const [sub] = await db.insert(poSubmissions).values({
      poNumber,
      imageUrls,
      imageKeys,
      supplierName: body.supplier_name?.trim() || null,
      supplierKey: body.supplier_key?.trim() || null,
      poStatus: body.po_status?.trim() || null,
      submissionType: body.submission_type?.trim() || 'receiving_checkin',
      priority: body.priority?.trim().toLowerCase() || null,
      notes: body.notes?.trim() || null,
      status: 'pending',
      submittedBy: session.user.id,
      submittedUsername: session.user.name ?? session.user.email ?? '',
      branch: session.user.branch ?? null,
    }).returning();

    return NextResponse.json(sub, { status: 201 });
  } catch (err) {
    console.error('[purchasing/submissions POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/purchasing/submissions — list submissions
// Query params: branch, status, since (ISO), my=true
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const onlyMine = searchParams.get('my') === 'true';
  const statusParam = searchParams.get('status') ?? '';
  const branchParam = searchParams.get('branch') ?? '';
  const sinceParam = searchParams.get('since') ?? '';

  const isAdmin = session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['supervisor', 'admin'].includes(r));

  try {
    const db = getDb();
    const conditions = [];

    if (onlyMine) {
      conditions.push(eq(poSubmissions.submittedBy, session.user.id));
    } else if (!isAdmin) {
      // Non-admin users can only see their own branch
      if (session.user.branch) {
        conditions.push(eq(poSubmissions.branch, session.user.branch));
      } else {
        conditions.push(eq(poSubmissions.submittedBy, session.user.id));
      }
    } else if (branchParam) {
      conditions.push(eq(poSubmissions.branch, branchParam));
    }

    if (statusParam) conditions.push(eq(poSubmissions.status, statusParam));
    if (sinceParam) {
      try {
        const since = new Date(sinceParam);
        conditions.push(gt(poSubmissions.createdAt, since));
      } catch { /* ignore bad date */ }
    }

    const rows = await db
      .select()
      .from(poSubmissions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(poSubmissions.createdAt))
      .limit(200);

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[purchasing/submissions GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

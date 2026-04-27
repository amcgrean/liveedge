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

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const notes = (body.notes as string) ?? '';
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'Beisser LiveEdge <noreply@app.beisser.cloud>',
          to: ['amcgrean@beisserlumber.com'],
          subject: `[IT Issue #${issue.id}] ${issueType} reported by ${session.user.name}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#004526">New IT Issue Reported</h2>
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:6px 0;color:#555;width:110px">Issue #</td><td style="padding:6px 0;font-weight:bold">${issue.id}</td></tr>
              <tr><td style="padding:6px 0;color:#555">Type</td><td style="padding:6px 0">${issueType}</td></tr>
              <tr><td style="padding:6px 0;color:#555">Reported by</td><td style="padding:6px 0">${session.user.name}</td></tr>
              <tr><td style="padding:6px 0;color:#555;vertical-align:top">Description</td><td style="padding:6px 0">${description}</td></tr>
              ${notes ? `<tr><td style="padding:6px 0;color:#555;vertical-align:top">Notes</td><td style="padding:6px 0">${notes}</td></tr>` : ''}
            </table>
            <p style="margin-top:24px"><a href="https://app.beisser.cloud/it-issues/${issue.id}" style="background:#006834;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">View Issue #${issue.id}</a></p>
          </div>`,
        }),
      }).catch((e) => console.error('[it-issues] email notify failed:', e));
    }

    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    console.error('[it-issues API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

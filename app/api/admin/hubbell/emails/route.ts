import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { hubbellEmails } from '../../../../../db/schema';
import { desc, eq, like, or, sql, and } from 'drizzle-orm';

// GET /api/admin/hubbell/emails?status=&search=&page=1
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? '';
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  if (role !== 'admin' && !roles.includes('hubbell')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') ?? '';   // pending | matched | unmatched | confirmed | rejected | ''
  const search = (searchParams.get('search') ?? '').trim();
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit  = 50;
  const offset = (page - 1) * limit;

  const db = getDb();

  const conditions = [];
  if (status) conditions.push(eq(hubbellEmails.matchStatus, status));
  if (search) {
    conditions.push(
      or(
        like(hubbellEmails.subject, `%${search}%`),
        like(hubbellEmails.fromEmail, `%${search}%`),
        like(hubbellEmails.extractedPoNumber, `%${search}%`),
        like(hubbellEmails.extractedWoNumber, `%${search}%`),
        like(hubbellEmails.confirmedSoId, `%${search}%`),
        like(hubbellEmails.extractedAddress, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db.select({
      id:                   hubbellEmails.id,
      messageId:            hubbellEmails.messageId,
      fromEmail:            hubbellEmails.fromEmail,
      fromName:             hubbellEmails.fromName,
      subject:              hubbellEmails.subject,
      emailType:            hubbellEmails.emailType,
      matchStatus:          hubbellEmails.matchStatus,
      confirmedSoId:        hubbellEmails.confirmedSoId,
      confirmedCustName:    hubbellEmails.confirmedCustName,
      matchConfidence:      hubbellEmails.matchConfidence,
      extractedPoNumber:    hubbellEmails.extractedPoNumber,
      extractedWoNumber:    hubbellEmails.extractedWoNumber,
      extractedAmount:      hubbellEmails.extractedAmount,
      extractedAddress:     hubbellEmails.extractedAddress,
      extractedCity:        hubbellEmails.extractedCity,
      extractedState:       hubbellEmails.extractedState,
      extractedZip:         hubbellEmails.extractedZip,
      extractedDescription: hubbellEmails.extractedDescription,
      receivedAt:           hubbellEmails.receivedAt,
    })
      .from(hubbellEmails)
      .where(where)
      .orderBy(desc(hubbellEmails.receivedAt))
      .limit(limit)
      .offset(offset),

    db.select({ total: sql<number>`COUNT(*)::int` })
      .from(hubbellEmails)
      .where(where),
  ]);

  // Status counts for tab badges
  const statusCounts = await db.select({
    status: hubbellEmails.matchStatus,
    count:  sql<number>`COUNT(*)::int`,
  })
    .from(hubbellEmails)
    .groupBy(hubbellEmails.matchStatus);

  return NextResponse.json({
    emails: rows,
    total:  countRows[0]?.total ?? 0,
    page,
    limit,
    statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r.count])),
  });
}

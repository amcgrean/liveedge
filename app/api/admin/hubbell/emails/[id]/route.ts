import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getDb } from '../../../../../../db/index';
import { hubbellEmails, hubbellEmailCandidates } from '../../../../../../db/schema';
import { eq, and, or, ne, inArray, sql } from 'drizzle-orm';
import { upsertAddressCache } from '@/lib/hubbell/address-cache';

type Params = Promise<{ id: string }>;

// GET /api/admin/hubbell/emails/[id]
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = getDb();

  const [emailRow] = await db.select().from(hubbellEmails).where(eq(hubbellEmails.id, id));
  if (!emailRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const candidates = await db
    .select()
    .from(hubbellEmailCandidates)
    .where(eq(hubbellEmailCandidates.emailId, id))
    .orderBy(hubbellEmailCandidates.rank);

  return NextResponse.json({ email: emailRow, candidates });
}

// POST /api/admin/hubbell/emails/[id]
// Body: { action: 'confirm', soId, custCode, custName, confidence } | { action: 'reject' } | { action: 'reset' }
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as {
    action: 'confirm' | 'reject' | 'reset';
    soId?: string;
    custCode?: string;
    custName?: string;
    confidence?: number;
  };

  const db = getDb();

  // Fetch full email row so we have extractedAddress for cache upsert
  const [emailRow] = await db
    .select()
    .from(hubbellEmails)
    .where(eq(hubbellEmails.id, id));
  if (!emailRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userId = (session.user as { id?: string }).id ?? session.user.email ?? 'unknown';
  const now = new Date();

  if (body.action === 'confirm') {
    if (!body.soId) return NextResponse.json({ error: 'soId required' }, { status: 400 });

    await db.update(hubbellEmails)
      .set({
        matchStatus:       'confirmed',
        confirmedSoId:     body.soId,
        confirmedCustCode: body.custCode ?? null,
        confirmedCustName: body.custName ?? null,
        matchConfidence:   body.confidence != null ? String(body.confidence) : null,
        confirmedBy:  userId,
        confirmedAt:  now,
        updatedAt:    now,
      })
      .where(eq(hubbellEmails.id, id));

    // Upsert learned address cache so future emails auto-confirm
    if (emailRow.extractedAddress) {
      // Look up shipto fields from the matched candidate if available
      const [candidate] = await db
        .select()
        .from(hubbellEmailCandidates)
        .where(eq(hubbellEmailCandidates.emailId, id))
        .orderBy(hubbellEmailCandidates.rank)
        .limit(1);

      const shiptoCandidate = candidate?.soId === body.soId ? candidate : null;

      await upsertAddressCache({
        address:      emailRow.extractedAddress,
        soId:         body.soId,
        custCode:     body.custCode ?? null,
        custName:     body.custName ?? null,
        shiptoAddress: shiptoCandidate?.shiptoAddress ?? null,
        shiptoCity:    shiptoCandidate?.shiptoCity    ?? null,
        shiptoState:   shiptoCandidate?.shiptoState   ?? null,
        shiptoZip:     shiptoCandidate?.shiptoZip     ?? null,
      }).catch((err) => console.error('[hubbell/confirm] address cache upsert failed', err));
    }

    // Auto-confirm all pending siblings that share the same PO#, WO#, or extracted address
    {
      const siblingConds = [
        ...(emailRow.extractedPoNumber ? [eq(hubbellEmails.extractedPoNumber, emailRow.extractedPoNumber)] : []),
        ...(emailRow.extractedWoNumber ? [eq(hubbellEmails.extractedWoNumber, emailRow.extractedWoNumber)] : []),
        ...(emailRow.extractedAddress
          ? [sql`LOWER(${hubbellEmails.extractedAddress}) = LOWER(${emailRow.extractedAddress})`]
          : []),
      ];
      if (siblingConds.length > 0) {
        await db.update(hubbellEmails)
          .set({
            matchStatus:       'confirmed',
            confirmedSoId:     body.soId,
            confirmedCustCode: body.custCode ?? null,
            confirmedCustName: body.custName ?? null,
            matchConfidence:   '100',
            confirmedBy:       'sibling_match',
            confirmedAt:       now,
            updatedAt:         now,
          })
          .where(and(
            inArray(hubbellEmails.matchStatus, ['pending', 'matched', 'unmatched']),
            ne(hubbellEmails.id, id),
            or(...siblingConds),
          ));
      }
    }

  } else if (body.action === 'reject') {
    await db.update(hubbellEmails)
      .set({
        matchStatus:   'rejected',
        confirmedSoId: null,
        confirmedBy:   userId,
        confirmedAt:   now,
        updatedAt:     now,
      })
      .where(eq(hubbellEmails.id, id));

  } else if (body.action === 'reset') {
    await db.update(hubbellEmails)
      .set({
        matchStatus:       'pending',
        confirmedSoId:     null,
        confirmedCustCode: null,
        confirmedCustName: null,
        confirmedBy:       null,
        confirmedAt:       null,
        updatedAt:         now,
      })
      .where(eq(hubbellEmails.id, id));

  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireSessionOrMobile } from '../../../../../src/lib/mobile-auth';
import { getDb } from '../../../../../db/index';
import { salesJobNotes } from '../../../../../db/schema';
import {
  activeScope,
  branchCode,
  cleanString,
  listOrder,
  noteCreateSchema,
  sessionUserId,
  toApiNote,
} from './_shared';

// GET /api/sales/mobile/job-notes?customer=&so=&mine=1&limit=
export async function GET(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;

  const url = new URL(req.url);
  const customer = cleanString(url.searchParams.get('customer'));
  const so = cleanString(url.searchParams.get('so'));
  const mine = url.searchParams.get('mine') === '1';
  const limitParam = Number(url.searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 100) : 50;

  const extra = [];
  if (customer) extra.push(eq(salesJobNotes.customerCode, customer));
  if (so) extra.push(eq(salesJobNotes.soId, so));
  if (mine) extra.push(eq(salesJobNotes.authorUserId, sessionUserId(authResult)));

  try {
    const rows = await getDb()
      .select()
      .from(salesJobNotes)
      .where(activeScope(authResult, extra))
      .orderBy(listOrder())
      .limit(limit);
    return NextResponse.json({ notes: rows.map(toApiNote) });
  } catch (err) {
    console.error('[sales/mobile/job-notes GET]', err);
    return NextResponse.json({ error: 'Failed to load job notes' }, { status: 500 });
  }
}

// POST /api/sales/mobile/job-notes
export async function POST(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = noteCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const [row] = await getDb()
      .insert(salesJobNotes)
      .values({
        authorUserId: sessionUserId(authResult),
        authorName: authResult.user?.name ?? null,
        branchCode: branchCode(authResult),
        customerCode: cleanString(input.customer_code),
        customerName: cleanString(input.customer_name),
        soId: cleanString(input.so_id),
        addressLabel: cleanString(input.address_label),
        noteType: input.note_type,
        body: input.body,
        fields: input.fields,
        photoKeys: input.photo_keys,
      })
      .returning();
    return NextResponse.json({ note: toApiNote(row) }, { status: 201 });
  } catch (err) {
    console.error('[sales/mobile/job-notes POST]', err);
    return NextResponse.json({ error: 'Failed to create job note' }, { status: 500 });
  }
}

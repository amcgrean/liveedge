import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireSessionOrMobile } from '../../../../../../src/lib/mobile-auth';
import { getDb } from '../../../../../../db/index';
import { salesJobNotes } from '../../../../../../db/schema';
import { activeScope, assertOwnedPhotoKeys, cleanString, editableScope, notePatchSchema, toApiNote } from '../_shared';

type RouteContext = { params: Promise<{ id: string }> };

async function getVisibleNote(id: string, session: Awaited<ReturnType<typeof requireSessionOrMobile>>) {
  if (session instanceof NextResponse) return null;
  const [row] = await getDb()
    .select()
    .from(salesJobNotes)
    .where(activeScope(session, [eq(salesJobNotes.id, id)]))
    .limit(1);
  return row ?? null;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await context.params;

  try {
    const row = await getVisibleNote(id, authResult);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ note: toApiNote(row) });
  } catch (err) {
    console.error('[sales/mobile/job-notes/[id] GET]', err);
    return NextResponse.json({ error: 'Failed to load job note' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = notePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const patch = parsed.data;
  const values: Partial<typeof salesJobNotes.$inferInsert> = { updatedAt: new Date() };
  if ('customer_code' in patch) values.customerCode = cleanString(patch.customer_code);
  if ('customer_name' in patch) values.customerName = cleanString(patch.customer_name);
  if ('so_id' in patch) values.soId = cleanString(patch.so_id);
  if ('address_label' in patch) values.addressLabel = cleanString(patch.address_label);
  if ('note_type' in patch && patch.note_type) values.noteType = patch.note_type;
  if ('body' in patch && patch.body !== undefined) values.body = patch.body;
  if ('fields' in patch && patch.fields !== undefined) values.fields = patch.fields;
  if ('photo_keys' in patch && patch.photo_keys !== undefined) {
    if (!assertOwnedPhotoKeys(authResult, patch.photo_keys)) {
      return NextResponse.json({ error: 'photo_keys must be within your own upload namespace' }, { status: 400 });
    }
    values.photoKeys = patch.photo_keys;
  }

  try {
    const [row] = await getDb()
      .update(salesJobNotes)
      .set(values)
      .where(editableScope(authResult, id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    return NextResponse.json({ note: toApiNote(row) });
  } catch (err) {
    console.error('[sales/mobile/job-notes/[id] PATCH]', err);
    return NextResponse.json({ error: 'Failed to update job note' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await context.params;

  try {
    const [row] = await getDb()
      .update(salesJobNotes)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(editableScope(authResult, id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sales/mobile/job-notes/[id] DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete job note' }, { status: 500 });
  }
}

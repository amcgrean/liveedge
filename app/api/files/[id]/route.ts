import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { hasCapability } from '../../../../src/lib/access-control-shared';
import { getDb } from '../../../../db/index';
import { getPresignedPdfUrl, deletePdf } from '@/lib/r2';
import { sql } from 'drizzle-orm';

type FileLookup = { id: string; file_name: string; r2_key: string; content_type: string; uploaded_by: number | null };

// GET /api/files/[id] — get presigned download URL
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('sales.view', 'yard.view', 'dispatch.view');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  try {
    const db = getDb();
    const rows = await db.execute(
      sql`SELECT id::text, file_name, r2_key, content_type, uploaded_by FROM bids.files WHERE id = ${id}::uuid`
    ) as unknown as FileLookup[];

    if (!rows[0]) return NextResponse.json({ error: 'File not found.' }, { status: 404 });

    const url = await getPresignedPdfUrl(rows[0].r2_key);
    return NextResponse.json({ url, file_name: rows[0].file_name, content_type: rows[0].content_type });
  } catch (err) {
    console.error('[api/files GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/files/[id] — delete file record + R2 object
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('sales.view', 'yard.view', 'dispatch.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { id } = await params;

  try {
    const db = getDb();

    const rows = await db.execute(
      sql`SELECT id::text, r2_key, uploaded_by FROM bids.files WHERE id = ${id}::uuid`
    ) as unknown as FileLookup[];

    if (!rows[0]) return NextResponse.json({ error: 'File not found.' }, { status: 404 });

    const isAdmin = hasCapability(session, 'admin.config.manage');
    const isOwner = rows[0].uploaded_by != null && String(rows[0].uploaded_by) === String(session.user.id);
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    await db.execute(sql`DELETE FROM bids.files WHERE id = ${id}::uuid`);
    try { await deletePdf(rows[0].r2_key); } catch { /* R2 object may already be gone */ }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/files DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

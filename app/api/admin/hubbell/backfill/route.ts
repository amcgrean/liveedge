// POST /api/admin/hubbell/backfill
//
// One-shot endpoint to repair a hubbell_documents row whose R2 object was
// overwritten by a later upload at the same key (the "stale-divergent" class
// identified in PR #405). The DB row's `source_hash` describes the original
// PDF bytes that no longer exist in R2; the caller supplies those bytes from
// a local cache (typically `C:\Users\amcgrean\python\hubbell test\hubbell_runs\`).
//
// Flow:
//   1. Sha256 the uploaded bytes.
//   2. Verify against the target row's stored source_hash (refuse if mismatch
//      — would mean the caller has the wrong PDF for this doc).
//   3. Build a fresh R2 key with the hash suffix (per PR #407 keying scheme).
//   4. PUT the bytes to R2 under the new key.
//   5. UPDATE hubbell_documents.r2_key on the target row.
//
// Auth: Bearer $HUBBELL_UPLOAD_TOKEN (matches the upload endpoint — runs
//       from a local script, not a user session).
//
// Body: multipart/form-data
//   document_id  — uuid of the row to repair
//   pdf          — file (application/pdf)
//
// Response: { status: 'restored' | 'already_correct', new_r2_key, document_id }

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../../../db/index';
import { verifyHubbellUploadToken } from '../../../../../src/lib/service-auth';
import { buildHubbellKey, putHubbellPdf } from '../../../../../src/lib/hubbell/r2';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const documentId = String(form.get('document_id') ?? '').trim();
  const pdf = form.get('pdf');

  if (!documentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
    return NextResponse.json({ error: 'document_id must be a uuid' }, { status: 400 });
  }
  if (!(pdf instanceof File)) {
    return NextResponse.json({ error: 'pdf file part is required' }, { status: 400 });
  }

  const arrayBuf = await pdf.arrayBuffer();
  const bytes = Buffer.from(arrayBuf);
  const uploadHash = crypto.createHash('sha256').update(bytes).digest('hex');

  const db = getDb();
  const [row] = await db
    .select({
      id: schema.hubbellDocuments.id,
      docType: schema.hubbellDocuments.docType,
      docNumber: schema.hubbellDocuments.docNumber,
      r2Key: schema.hubbellDocuments.r2Key,
      sourceHash: schema.hubbellDocuments.sourceHash,
      receivedAt: schema.hubbellDocuments.receivedAt,
    })
    .from(schema.hubbellDocuments)
    .where(eq(schema.hubbellDocuments.id, documentId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'document not found' }, { status: 404 });
  }
  if (row.sourceHash !== uploadHash) {
    return NextResponse.json({
      error: 'sha256 mismatch — the uploaded PDF does not match this row',
      expected_hash: row.sourceHash,
      uploaded_hash: uploadHash,
    }, { status: 409 });
  }

  const docType = row.docType === 'po' || row.docType === 'wo' ? row.docType : null;
  if (!docType) {
    return NextResponse.json({ error: `unexpected doc_type=${row.docType}` }, { status: 500 });
  }

  const newKey = buildHubbellKey({
    docType,
    docNumber: row.docNumber,
    receivedAt: row.receivedAt ?? new Date(),
    sourceHash: row.sourceHash ?? undefined,
  });

  // If the row already has the new hashed key shape and points where we'd
  // write, nothing to do (the supersession bug doesn't apply here).
  if (row.r2Key === newKey) {
    return NextResponse.json({ status: 'already_correct', new_r2_key: newKey, document_id: row.id });
  }

  try {
    await putHubbellPdf(newKey, bytes);
  } catch (err) {
    console.error('[hubbell backfill] R2 put failed', err);
    return NextResponse.json({ error: 'PDF storage failed' }, { status: 502 });
  }

  await db
    .update(schema.hubbellDocuments)
    .set({ r2Key: newKey })
    .where(eq(schema.hubbellDocuments.id, documentId));

  return NextResponse.json({ status: 'restored', new_r2_key: newKey, document_id: row.id });
}

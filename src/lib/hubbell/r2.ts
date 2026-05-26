// Hubbell-specific R2 helpers — thin wrappers over src/lib/r2.ts so the
// upload route doesn't reach across modules to compute keys.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('R2 storage is not configured.');
    }
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME || 'bids';
}

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function buildHubbellKey(params: {
  docType: 'po' | 'wo';
  docNumber: string;
  receivedAt?: Date;
  // Append a short prefix of the document's source_hash so re-uploads of a
  // different PDF under the same (doc_type, doc_number) — Hubbell occasionally
  // reuses doc numbers for a new job — land on a distinct R2 object instead
  // of silently overwriting the prior one. Without this, the older
  // hubbell_documents row keeps its (now-stale) extracted_* metadata but its
  // r2_key resolves to a different PDF, causing reviewer mismatch.
  // See PR #405 for the supersession skip that gates against the same root
  // cause on the reconciler side, and PR #406 (this PR) for the fix at the
  // write path.
  // Pre-2026-05-27 uploads used the un-hashed key shape and are still
  // readable (their R2 objects exist on the old keys) — only NEW uploads
  // adopt the hashed shape.
  sourceHash?: string;
}): string {
  const yyyy = (params.receivedAt ?? new Date()).getUTCFullYear();
  const num = safeSegment(params.docNumber);
  const hashSuffix =
    params.sourceHash && /^[0-9a-f]+$/i.test(params.sourceHash)
      ? `-${params.sourceHash.slice(0, 12)}`
      : '';
  return `hubbell/${yyyy}/${params.docType}/${num}${hashSuffix}.pdf`;
}

export async function putHubbellPdf(key: string, data: Buffer | Uint8Array): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: data,
      ContentType: 'application/pdf',
    })
  );
}

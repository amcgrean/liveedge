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
}): string {
  const yyyy = (params.receivedAt ?? new Date()).getUTCFullYear();
  return `hubbell/${yyyy}/${params.docType}/${safeSegment(params.docNumber)}.pdf`;
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

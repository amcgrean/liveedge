import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { requireSessionOrMobile } from '../../../../../../src/lib/mobile-auth';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/webp']);

const bodySchema = z.object({
  noteId: z.string().trim().optional(),
  fileName: z.string().trim().max(180).optional(),
  contentType: z.string().trim().optional(),
  ext: z.string().trim().max(12).optional(),
});

function buildClient(): { client: S3Client; bucket: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket: process.env.R2_BUCKET_NAME || 'bids',
  };
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'photo.jpg';
}

function randomId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
}

export async function POST(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    // optional body
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const contentType = (parsed.data.contentType ?? 'image/jpeg').toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'Unsupported contentType' }, { status: 400 });
  }
  const ext = (parsed.data.ext ?? contentType.split('/')[1] ?? 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg';
  const noteId = (parsed.data.noteId ?? randomId()).replace(/[^A-Za-z0-9-]/g, '').slice(0, 80) || randomId();
  const baseName = sanitizeName(parsed.data.fileName ?? `photo.${ext}`);
  // Namespace keys by the caller's user id so create/patch can verify a note
  // only carries keys the requesting user minted (prevents cross-user key reuse
  // via the /photos presign endpoint).
  const userId = String(authResult.user?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'unknown';
  const key = `job-notes/${userId}/${noteId}/${Date.now()}-${baseName}`;
  const setup = buildClient();
  if (!setup) return NextResponse.json({ error: 'R2 storage not configured' }, { status: 503 });

  try {
    const expiresIn = 600;
    const url = await getSignedUrl(
      setup.client,
      new PutObjectCommand({ Bucket: setup.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
    return NextResponse.json({ url, key, expiresIn });
  } catch (err) {
    console.error('[sales/mobile/job-notes/photo-upload-url POST]', err);
    return NextResponse.json({ error: 'Failed to sign upload URL' }, { status: 500 });
  }
}

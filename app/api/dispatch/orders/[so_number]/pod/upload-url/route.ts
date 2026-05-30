import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireSessionOrMobile } from '../../../../../../../src/lib/mobile-auth';

/**
 * POST /api/dispatch/orders/:so_number/pod/upload-url
 *
 * Returns a 10-minute presigned PUT URL for the mobile app to upload a POD
 * photo directly to R2. The client then references the returned `key` in
 * the subsequent POST to /deliver so the back-end knows which uploads
 * belong to this delivery.
 *
 * Body: { contentType?: string, ext?: string }   // defaults image/jpeg, jpg
 * Response: { url: string, key: string, expiresIn: number }
 */

type RouteContext = { params: Promise<{ so_number: string }> };

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/webp',
]);

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

export async function POST(req: NextRequest, context: RouteContext) {
  const authResult = await requireSessionOrMobile(req, 'dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { so_number: soNumber } = await context.params;
  if (!/^[A-Za-z0-9-]+$/.test(soNumber)) {
    return NextResponse.json({ error: 'Invalid SO number' }, { status: 400 });
  }

  let body: { contentType?: string; ext?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  const contentType = (body.contentType ?? 'image/jpeg').toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'Unsupported contentType' }, { status: 400 });
  }
  const ext = (body.ext ?? contentType.split('/')[1] ?? 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg';

  const setup = buildClient();
  if (!setup) {
    return NextResponse.json({ error: 'R2 storage not configured' }, { status: 503 });
  }

  // Photos land under pod/<so>/<ts>-<rand>.<ext>. Server-derived names keep
  // the client from being able to overwrite an existing object.
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const key = `pod/${soNumber}/${ts}-${rand}.${ext}`;
  const expiresIn = 600;

  try {
    const url = await getSignedUrl(
      setup.client,
      new PutObjectCommand({
        Bucket: setup.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn }
    );
    return NextResponse.json({ url, key, expiresIn });
  } catch (err) {
    console.error(`[pod/${soNumber}/upload-url POST]`, err);
    return NextResponse.json({ error: 'Failed to sign upload URL' }, { status: 500 });
  }
}

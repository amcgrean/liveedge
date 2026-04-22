import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// GET /api/credits/[id]/upload?filename=X&content_type=Y
// Returns a presigned R2 PUT URL valid for 10 minutes.
// [id] is the SO/CM number (e.g. "1481202").

// POST /api/credits/[id]/upload
// Confirms a completed upload and writes a credit_images row.
// Body: { filename, r2_key, content_type }

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

function getR2(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('R2 not configured');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: soId } = await params;
  const { searchParams } = req.nextUrl;
  const filename = searchParams.get('filename')?.trim();
  const contentType = searchParams.get('content_type')?.trim() ?? 'application/octet-stream';

  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 422 });
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 422 });
  }

  try {
    const r2 = getR2();
    const bucket = process.env.R2_BUCKET_NAME || 'bids';
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2Key = `credits/${soId}/${Date.now()}-${safeFilename}`;

    const uploadUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        ContentType: contentType,
      }),
      { expiresIn: 600 }
    );

    return NextResponse.json({ upload_url: uploadUrl, r2_key: r2Key });
  } catch (err) {
    console.error('[credits/upload GET]', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: soId } = await params;
  const userEmail = (session.user as { email?: string }).email ?? 'app-upload';

  let body: { filename: string; r2_key: string; content_type: string };
  try {
    body = await req.json() as { filename: string; r2_key: string; content_type: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { filename, r2_key, content_type } = body;
  if (!filename || !r2_key) {
    return NextResponse.json({ error: 'filename and r2_key required' }, { status: 422 });
  }

  // Sanity check: r2_key must be under the correct CM prefix to prevent spoofing
  if (!r2_key.startsWith(`credits/${soId}/`)) {
    return NextResponse.json({ error: 'Invalid r2_key' }, { status: 422 });
  }

  try {
    const sql = getErpSql();
    await sql`
      INSERT INTO credit_images
        (rma_number, filename, filepath, email_from, email_subject, received_at, uploaded_at, r2_key)
      VALUES
        (${soId}, ${filename}, ${r2_key}, ${userEmail}, ${'Direct upload via LiveEdge'},
         NOW(), NOW(), ${r2_key})
      ON CONFLICT (r2_key) DO UPDATE
        SET uploaded_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[credits/upload POST]', err);
    return NextResponse.json({ error: 'Failed to save record' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// GET /api/credits/[id]/image
// Returns a short-lived presigned R2 URL for a credit image attachment.

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 not configured');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const imgId = parseInt(id, 10);
  if (isNaN(imgId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const sql = getErpSql();

    type Row = { r2_key: string | null; filename: string };
    const rows = await sql<Row[]>`
      SELECT r2_key, filename FROM credit_images WHERE id = ${imgId} LIMIT 1
    `;

    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!rows[0].r2_key) return NextResponse.json({ error: 'No R2 key — image not in cloud storage' }, { status: 404 });

    const r2 = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME || 'bids';

    const url = await getSignedUrl(
      r2,
      new GetObjectCommand({
        Bucket: bucket,
        Key: rows[0].r2_key,
        ResponseContentDisposition: `inline; filename="${rows[0].filename}"`,
      }),
      { expiresIn: 900 } // 15 minutes
    );

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[credits/image GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function getR2(): S3Client {
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

function getBucket() {
  return process.env.R2_BUCKET_NAME || 'bids';
}

function getPublicUrl() {
  return (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');
}

function sanitizePo(po: string) {
  return po.replace(/[^a-zA-Z0-9]/g, '_');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });
  }

  const form = await req.formData();
  const fileEntry = form.get('file');
  const poNumber = ((form.get('po_number') as string) ?? 'unknown').trim() || 'unknown';

  if (!fileEntry || typeof fileEntry === 'string') {
    return NextResponse.json({ error: 'No file in request' }, { status: 400 });
  }

  if (!fileEntry.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }

  const now = new Date();
  const key = `po-photos/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${sanitizePo(poNumber)}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;

  try {
    const r2 = getR2();
    const buf = Buffer.from(await fileEntry.arrayBuffer());
    await r2.send(new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buf,
      ContentType: fileEntry.type,
    }));

    const url = `${getPublicUrl()}/${key}`;
    return NextResponse.json({ url, key });
  } catch (err) {
    console.error('[purchasing/photos]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

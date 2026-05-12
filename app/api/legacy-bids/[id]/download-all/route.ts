import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyBid, legacyBidFile } from '../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { zipSync } from 'fflate';

type RouteContext = { params: Promise<{ id: string }> };

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

async function fetchR2File(r2: S3Client, key: string): Promise<Uint8Array | null> {
  try {
    const res = await r2.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || 'bids',
      Key: key,
    }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.length; }
    return buf;
  } catch {
    return null;
  }
}

/** Sanitize a filename for ZIP (strip path separators, collapse spaces) */
function safeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/\s+/g, '_').replace(/[^\w.\-]/g, '') || 'file';
}

// ──────────────────────────────────────────────────────────
// GET /api/legacy-bids/:id/download-all
// Returns a ZIP of all files attached to the bid.
// ──────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const bidId = parseInt(id, 10);
  if (isNaN(bidId)) return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });

  try {
    const db = getDb();
    const r2 = getR2();

    // Load bid (plan_filename + email_filename) and additional files
    const [bid] = await db.select().from(legacyBid).where(eq(legacyBid.id, bidId)).limit(1);
    if (!bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

    const bidFiles = await db.select().from(legacyBidFile).where(eq(legacyBidFile.bidId, bidId));

    // Collect all files to include
    type FileEntry = { key: string; name: string };
    const entries: FileEntry[] = [];

    if (bid.planFilename) {
      const name = bid.planFilename.split('/').pop() ?? 'plan.pdf';
      entries.push({ key: bid.planFilename, name: `plan_${safeFilename(name)}` });
    }
    if (bid.emailFilename) {
      const name = bid.emailFilename.split('/').pop() ?? 'email.pdf';
      entries.push({ key: bid.emailFilename, name: `email_${safeFilename(name)}` });
    }
    for (const f of bidFiles) {
      entries.push({ key: f.fileKey, name: safeFilename(f.filename ?? f.fileKey.split('/').pop() ?? 'file') });
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No files attached to this bid' }, { status: 404 });
    }

    // Fetch all files from R2 in parallel
    const fetched = await Promise.all(
      entries.map(async (e) => ({ name: e.name, data: await fetchR2File(r2, e.key) }))
    );

    // Build ZIP — deduplicate names
    const zipEntries: Record<string, Uint8Array> = {};
    const seen = new Map<string, number>();
    for (const f of fetched) {
      if (!f.data) continue; // skip missing files
      let name = f.name;
      const count = seen.get(name) ?? 0;
      if (count > 0) {
        const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
        const base = ext ? name.slice(0, -ext.length) : name;
        name = `${base}_${count}${ext}`;
      }
      seen.set(f.name, count + 1);
      zipEntries[name] = f.data;
    }

    if (Object.keys(zipEntries).length === 0) {
      return NextResponse.json({ error: 'No files could be retrieved from storage' }, { status: 502 });
    }

    const zipData = zipSync(zipEntries, { level: 0 }); // level 0 = store only (PDFs don't compress)

    const slug = (bid.projectName ?? `bid-${bidId}`).replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    const filename = `${slug}-files.zip`;

    return new NextResponse(Buffer.from(zipData), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipData.length),
      },
    });
  } catch (err) {
    console.error('[download-all]', err);
    return NextResponse.json({ error: 'Failed to build ZIP' }, { status: 500 });
  }
}

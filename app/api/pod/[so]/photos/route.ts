/**
 * POST /api/pod/[so]/photos
 *   Accepts multipart FormData: image file(s) + branch, shipment_num, category,
 *   driver_name, notes, agility_guid fields.
 *   Uploads to R2, records in bids.pod_photos.
 *
 * GET /api/pod/[so]/photos?branch=20GR
 *   Returns photo list with presigned R2 URLs for viewing.
 *   No auth required — called by our own viewer page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { uploadImage, getPresignedUrl } from '../../../../../src/lib/r2';
import { sql } from 'drizzle-orm';

type RouteContext = { params: Promise<{ so: string }> };

// Raw SQL table access — pod_photos is managed by migration 0009, not drizzle-kit
async function insertPhoto(row: {
  so_id: string;
  branch_code: string;
  shipment_num: number;
  agility_guid: string | null;
  r2_key: string;
  filename: string;
  content_type: string;
  file_size: number | null;
  category: string;
  driver_name: string | null;
  notes: string | null;
}) {
  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO bids.pod_photos
      (so_id, branch_code, shipment_num, agility_guid, r2_key, filename,
       content_type, file_size, category, driver_name, notes)
    VALUES
      (${row.so_id}, ${row.branch_code}, ${row.shipment_num}, ${row.agility_guid},
       ${row.r2_key}, ${row.filename}, ${row.content_type}, ${row.file_size},
       ${row.category}, ${row.driver_name}, ${row.notes})
    RETURNING id, taken_at
  `);
  return (result as unknown as { id: number; taken_at: string }[])[0];
}

async function listPhotos(soId: string, branchCode: string) {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT id, so_id, branch_code, shipment_num, agility_guid, r2_key,
           filename, content_type, file_size, category, driver_name, notes, taken_at
    FROM bids.pod_photos
    WHERE so_id = ${soId} AND branch_code = ${branchCode}
    ORDER BY taken_at ASC
  `);
  return result as unknown as Array<{
    id: number; so_id: string; branch_code: string; shipment_num: number;
    agility_guid: string | null; r2_key: string; filename: string;
    content_type: string; file_size: number | null; category: string;
    driver_name: string | null; notes: string | null; taken_at: string;
  }>;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, context: RouteContext) {
  const { so } = await context.params;
  const { searchParams } = new URL(req.url);
  const branch = searchParams.get('branch')?.trim() ?? '';

  if (!branch) {
    return NextResponse.json({ error: 'branch required' }, { status: 400 });
  }

  try {
    const photos = await listPhotos(so, branch);

    // Generate 1-hour presigned URLs for each photo
    const withUrls = await Promise.all(
      photos.map(async (p) => ({
        ...p,
        url: await getPresignedUrl(p.r2_key, 3600),
      }))
    );

    return NextResponse.json({ photos: withUrls });
  } catch (err) {
    console.error('[pod photos GET]', err);
    return NextResponse.json({ error: 'Failed to load photos' }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { so } = await context.params;

  try {
    const form = await req.formData();

    const branch       = (form.get('branch')       as string | null)?.trim() ?? '';
    const shipmentNum  = parseInt((form.get('shipment_num') as string | null) ?? '1', 10);
    const agilityGuid  = (form.get('agility_guid') as string | null)?.trim() || null;
    const category     = (form.get('category')     as string | null)?.trim() || 'delivery';
    const driverName   = (form.get('driver_name')  as string | null)?.trim() || null;
    const notes        = (form.get('notes')        as string | null)?.trim() || null;

    if (!branch) {
      return NextResponse.json({ error: 'branch required' }, { status: 400 });
    }

    // Collect all uploaded files (field name "photos" or "photo")
    const files: File[] = [];
    for (const [key, val] of form.entries()) {
      if ((key === 'photos' || key === 'photo') && val instanceof File) {
        files.push(val);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'At least one photo required' }, { status: 400 });
    }

    // Max 10 photos per call, max 10MB each
    const MAX_PHOTOS = 10;
    const MAX_SIZE   = 10 * 1024 * 1024;
    if (files.length > MAX_PHOTOS) {
      return NextResponse.json({ error: `Max ${MAX_PHOTOS} photos per upload` }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const saved: { id: unknown; filename: string; url: string }[] = [];

    for (const file of files) {
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: `File ${file.name} exceeds 10MB limit` }, { status: 400 });
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const safeFilename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const r2Key = `pod/${year}/${branch}/${so}/${safeFilename}`;

      const buf = Buffer.from(await file.arrayBuffer());
      await uploadImage(r2Key, buf, file.type || 'image/jpeg');

      const record = await insertPhoto({
        so_id:        so,
        branch_code:  branch,
        shipment_num: isNaN(shipmentNum) ? 1 : shipmentNum,
        agility_guid: agilityGuid,
        r2_key:       r2Key,
        filename:     file.name,
        content_type: file.type || 'image/jpeg',
        file_size:    file.size,
        category,
        driver_name:  driverName,
        notes,
      });

      const url = await getPresignedUrl(r2Key, 3600);
      saved.push({ id: record?.id, filename: file.name, url });
    }

    return NextResponse.json({ photos: saved, count: saved.length }, { status: 201 });
  } catch (err) {
    console.error('[pod photos POST]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

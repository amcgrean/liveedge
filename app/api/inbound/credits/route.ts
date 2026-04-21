import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getErpSql } from '../../../../db/supabase';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// POST /api/inbound/credits
// Resend inbound webhook — fires on email.received for *@rma.beisser.cloud
// Verifies signature via Svix, uploads attachments to R2, upserts credit_images rows.

type ResendAttachment = {
  filename: string;
  content: string;       // base64-encoded
  content_type: string;
  content_disposition?: string;
  content_id?: string;   // set on HTML-embedded parts (cid: references); absent on real file attachments
  size?: number;
};

type ResendEmailPayload = {
  type: string;
  created_at: string;
  data: {
    from: string;
    to: string[];
    subject: string | null;
    text: string | null;
    html: string | null;
    attachments?: ResendAttachment[];
    messageId?: string;
  };
};

function extractRmaNumber(subject: string | null, text: string | null): string {
  const sources = [subject ?? '', text?.slice(0, 500) ?? ''];
  for (const src of sources) {
    // Match: RMA 12345, RMA#12345, RMA-12345, Credit 12345
    const m = src.match(/(?:RMA|rma)[#\s\-]?(\d{4,})/i)
      ?? src.match(/(?:Credit|credit)[#\s\-]?(\d{4,})/i);
    if (m) return m[1];
  }
  // Fall back to first standalone 4+ digit number
  const fallback = (subject ?? '').match(/\b(\d{4,})\b/);
  return fallback ? fallback[1] : 'UNKNOWN';
}

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

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[inbound/credits] RESEND_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Verify Svix signature
  const svixId        = req.headers.get('svix-id') ?? '';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
  const svixSignature = req.headers.get('svix-signature') ?? '';

  let payload: ResendEmailPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendEmailPayload;
  } catch (err) {
    console.error('[inbound/credits] Signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only process email.received events
  if (payload.type !== 'email.received') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Only handle emails addressed to *@rma.beisser.cloud — ignore events from other inbound domains
  const toAddresses = payload.data.to ?? [];
  if (!toAddresses.some(addr => /@rma\.beisser\.cloud$/i.test(addr))) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { from, subject, text, attachments } = payload.data;
  const rmaNumber = extractRmaNumber(subject, text);
  const receivedAt = payload.created_at ? new Date(payload.created_at) : new Date();

  if (!attachments?.length) {
    // No attachments — log metadata only with no r2_key
    const sql = getErpSql();
    await sql`
      INSERT INTO credit_images (rma_number, filename, filepath, email_from, email_subject, received_at, uploaded_at)
      VALUES (${rmaNumber}, '(no attachment)', '', ${from}, ${subject ?? null}, ${receivedAt.toISOString()}, NOW())
    `;
    return NextResponse.json({ ok: true, rma: rmaNumber, uploaded: 0 });
  }

  const r2 = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME || 'bids';
  const sql = getErpSql();
  let uploaded = 0;

  for (const att of attachments) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowed.includes(att.content_type)) continue;
    // Skip HTML-embedded parts (email signatures, tracking pixels) — they carry a Content-ID
    // used by the HTML body as a cid: reference. Real file attachments don't have one.
    if (att.content_id) continue;

    const safeFilename = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const r2Key = `credits/${rmaNumber}/${timestamp}-${safeFilename}`;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(att.content, 'base64');
    } catch {
      console.warn('[inbound/credits] Could not decode attachment', att.filename);
      continue;
    }

    // Upload to R2
    try {
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: buffer,
        ContentType: att.content_type,
        Metadata: {
          rma_number: rmaNumber,
          email_from: from,
        },
      }));
    } catch (err) {
      console.error('[inbound/credits] R2 upload failed', att.filename, err);
      continue;
    }

    // Upsert credit_images row
    try {
      await sql`
        INSERT INTO credit_images
          (rma_number, filename, filepath, email_from, email_subject, received_at, uploaded_at, r2_key)
        VALUES
          (${rmaNumber}, ${att.filename}, ${r2Key}, ${from}, ${subject ?? null},
           ${receivedAt.toISOString()}, NOW(), ${r2Key})
        ON CONFLICT (r2_key) DO UPDATE
          SET uploaded_at = NOW()
      `;
      uploaded++;
    } catch (err) {
      console.error('[inbound/credits] DB upsert failed', att.filename, err);
    }
  }

  console.log(`[inbound/credits] RMA ${rmaNumber} — ${uploaded} attachment(s) uploaded from ${from}`);
  return NextResponse.json({ ok: true, rma: rmaNumber, uploaded });
}

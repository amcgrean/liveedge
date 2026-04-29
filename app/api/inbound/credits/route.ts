import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getErpSql } from '../../../../db/supabase';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// POST /api/inbound/credits
// Resend inbound webhook — fires on email.received for:
//   credits@beisser.cloud  (current — IT whitelisted beisser.cloud domain)
//   *@rma.beisser.cloud    (legacy subdomain — kept for transition period)
// Verifies signature via Svix, uploads attachments to R2, upserts credit_images rows.

type ResendAttachment = {
  id?: string;             // UUID used to fetch content via Resend API (newer format)
  filename: string;
  content?: string;        // base64-encoded (present in older/small-payload format)
  content_type: string;
  content_disposition?: string;
  content_id?: string;     // set on HTML-embedded parts (cid: references); absent on real file attachments
  size?: number;
};

type ResendEmailPayload = {
  type: string;
  created_at: string;
  data: {
    email_id?: string;   // inbound email UUID — used to fetch attachments via Resend API
    from: string;
    to: string[];
    subject: string | null;
    text: string | null;
    html: string | null;
    attachments?: ResendAttachment[];
    messageId?: string;
  };
};

// Resend no longer includes attachment content inline in the webhook.
// Instead, call their API to get a short-lived download_url, then fetch the bytes.
// Endpoint: GET https://api.resend.com/emails/receiving/{emailId}/attachments/{attachmentId}
async function fetchAttachmentBuffer(att: ResendAttachment, emailId: string | undefined): Promise<Buffer | null> {
  // Legacy / small payload: content was base64-encoded inline
  if (att.content) {
    try {
      return Buffer.from(att.content, 'base64');
    } catch {
      // fall through to API fetch
    }
  }

  if (!att.id || !emailId) {
    console.warn('[inbound/credits] No content and no id/emailId for', att.filename);
    return null;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[inbound/credits] RESEND_API_KEY not set — cannot fetch attachment');
    return null;
  }

  try {
    // Step 1: get the signed download_url from Resend
    const metaRes = await fetch(
      `https://api.resend.com/emails/receiving/${emailId}/attachments/${att.id}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!metaRes.ok) {
      console.error('[inbound/credits] Resend attachment meta fetch failed', metaRes.status, att.filename);
      return null;
    }
    const meta = await metaRes.json() as { download_url?: string };
    if (!meta.download_url) {
      console.error('[inbound/credits] No download_url in Resend attachment response', att.filename);
      return null;
    }

    // Step 2: download the actual bytes
    const fileRes = await fetch(meta.download_url);
    if (!fileRes.ok) {
      console.error('[inbound/credits] Attachment download failed', fileRes.status, att.filename);
      return null;
    }
    return Buffer.from(await fileRes.arrayBuffer());
  } catch (err) {
    console.error('[inbound/credits] Error fetching attachment', att.filename, err);
    return null;
  }
}

// ─── Nested email MIME extractor ──────────────────────────────────────────────
// Handles the case where someone attaches a forwarded email (.eml / message/rfc822)
// that itself contains image or PDF attachments.
// Walks multipart/* recursively; collects image/pdf leaf parts.

type ExtractedPart = { filename: string; content_type: string; buffer: Buffer };

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

function escapeBoundary(b: string) {
  return b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPartsFromRawEmail(raw: string): ExtractedPart[] {
  const results: ExtractedPart[] = [];

  function walk(text: string): void {
    // Normalize CRLF → LF
    const s = text.replace(/\r\n/g, '\n');

    // Split headers from body at the first blank line
    const blankIdx = s.indexOf('\n\n');
    if (blankIdx === -1) return;
    const headerBlock = s.slice(0, blankIdx);
    const body = s.slice(blankIdx + 2);

    // Parse Content-Type (may fold across lines)
    const ctRaw = headerBlock
      .match(/^content-type:\s*([^\n]+(?:\n[ \t][^\n]+)*)/im)?.[1]
      ?.replace(/\n[ \t]/g, ' ')
      .trim() ?? '';
    const ct = ctRaw.split(';')[0].trim().toLowerCase();

    if (ct.startsWith('multipart/')) {
      const bm = ctRaw.match(/boundary="?([^";]+)"?/i);
      if (!bm) return;
      const boundary = bm[1].trim();
      // Split on boundary markers; ignore the preamble and epilogue
      const re = new RegExp(`--${escapeBoundary(boundary)}(?:--)?`, 'g');
      const parts = body.split(re).slice(1); // drop preamble before first boundary
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed === '' || trimmed === '--') continue;
        walk(trimmed);
      }
      return;
    }

    if (!ALLOWED_MIME.includes(ct)) return;

    // Extract filename from Content-Disposition or Content-Type
    const fnMatch =
      headerBlock.match(/filename\*?="?([^"\n;]+)"?/i) ??
      headerBlock.match(/name="?([^"\n;]+)"?/i);
    const ext = ct.split('/')[1] ?? 'bin';
    const filename = fnMatch?.[1]?.trim() ?? `attachment.${ext}`;

    // Decode body
    const enc = (headerBlock.match(/^content-transfer-encoding:\s*([^\n]+)/im)?.[1] ?? '')
      .trim().toLowerCase();
    let buffer: Buffer;
    try {
      if (enc === 'base64') {
        buffer = Buffer.from(body.replace(/\s+/g, ''), 'base64');
      } else {
        // 7bit / 8bit / binary — treat as raw bytes
        buffer = Buffer.from(body, 'binary');
      }
    } catch {
      return;
    }

    // Skip suspiciously small parts (signature icons are typically < 5 KB)
    if (buffer.length > 5000) {
      results.push({ filename, content_type: ct, buffer });
    }
  }

  try {
    walk(raw);
  } catch (err) {
    console.error('[inbound/credits] MIME walk error', err);
  }
  return results;
}

function extractRmaNumber(subject: string | null, text: string | null, toAddresses: string[]): string {
  // Legacy: if using {so_id}@rma.beisser.cloud, the local part IS the CM number.
  // With credits@beisser.cloud the local part is just "credits" — falls through.
  for (const addr of toAddresses) {
    const m = addr.match(/^([^@]+)@rma\.beisser\.cloud$/i);
    if (m) {
      const digits = m[1].match(/(\d{4,})/);
      if (digits) return digits[1];
    }
  }

  // Primary for credits@beisser.cloud: parse subject / first 500 chars of body
  const sources = [subject ?? '', text?.slice(0, 500) ?? ''];
  for (const src of sources) {
    // RMA 12345, RMA#12345, CM-12345, Credit 12345, SO 12345
    const m =
      src.match(/(?:RMA|CM)[#\s\-]?(\d{4,})/i) ??
      src.match(/(?:Credit|SO)[#\s\-]?(\d{4,})/i);
    if (m) return m[1];
  }

  // Last resort: first standalone 4+ digit number in the subject
  const fallback = (subject ?? '').match(/\b(\d{4,})\b/);
  return fallback ? fallback[1] : 'UNKNOWN';
}

// Extract candidate address tokens from free-form text.
// Returns the best candidate street fragment (house number + street name) if found.
function extractAddressFragment(text: string): string | null {
  // Match "123 Oak Street", "456 N Main Ave", "789 County Rd 12", etc.
  const m = text.match(
    /\b(\d{1,6}(?:\s+[NSEW]\.?)?\s+[A-Za-z][A-Za-z\s]{2,30}(?:St(?:reet)?|Ave(?:nue)?|Rd|Road|Dr(?:ive)?|Ln|Lane|Blvd|Pkwy|Hwy|Way|Ct|Court|Pl|Place|Loop|Trail|Trl|Creek|Lake|Park)\.?)\b/i
  );
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

// Try to find the ONE open credit memo whose ship-to address matches the address
// fragment extracted from the email subject/body. Returns the so_id string if
// exactly one CM matches; 'UNKNOWN' if zero or multiple match (ambiguous).
async function lookupRmaByAddress(
  subject: string | null,
  text: string | null,
): Promise<string> {
  const searchText = `${subject ?? ''} ${text?.slice(0, 1000) ?? ''}`;
  const fragment = extractAddressFragment(searchText);
  if (!fragment) return 'UNKNOWN';

  try {
    const sql = getErpSql();
    const rows = await sql<{ so_id: string }[]>`
      SELECT soh.so_id::text AS so_id
      FROM agility_so_header soh
      WHERE soh.sale_type = 'Credit'
        AND soh.so_status NOT IN ('I', 'C')
        AND soh.is_deleted = false
        AND soh.shipto_address_1 ILIKE ${'%' + fragment.split(' ').slice(0, 3).join(' ') + '%'}
      LIMIT 5
    `;

    if (rows.length === 1) {
      console.log(`[inbound/credits] Address match "${fragment}" → CM ${rows[0].so_id}`);
      return rows[0].so_id;
    }

    if (rows.length > 1) {
      // Try to narrow by city if multiple CMs share that street
      const cityMatch = searchText.match(/\b([A-Za-z]{3,}(?:\s+[A-Za-z]+)?),?\s+(?:IA|Iowa)\b/i);
      if (cityMatch) {
        const city = cityMatch[1].trim();
        const narrowRows = await sql<{ so_id: string }[]>`
          SELECT soh.so_id::text AS so_id
          FROM agility_so_header soh
          WHERE soh.sale_type = 'Credit'
            AND soh.so_status NOT IN ('I', 'C')
            AND soh.is_deleted = false
            AND soh.shipto_address_1 ILIKE ${'%' + fragment.split(' ').slice(0, 3).join(' ') + '%'}
            AND soh.shipto_city ILIKE ${'%' + city + '%'}
          LIMIT 5
        `;
        if (narrowRows.length === 1) {
          console.log(`[inbound/credits] Address+city match "${fragment}, ${city}" → CM ${narrowRows[0].so_id}`);
          return narrowRows[0].so_id;
        }
      }
      console.warn(`[inbound/credits] Address "${fragment}" matched ${rows.length} open CMs — ambiguous, storing as UNKNOWN`);
    } else {
      console.warn(`[inbound/credits] Address "${fragment}" matched no open CMs`);
    }
  } catch (err) {
    console.error('[inbound/credits] Address lookup failed', err);
  }

  return 'UNKNOWN';
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

  // Only handle emails addressed to credits@beisser.cloud or *@rma.beisser.cloud (legacy).
  // The hubbell@beisser.cloud guard in /api/inbound/hubbell is a separate exact match,
  // so there is no collision even though both addresses share the beisser.cloud domain.
  const toAddresses = payload.data.to ?? [];
  const isCreditsEmail = toAddresses.some(addr =>
    /^credits@beisser\.cloud$/i.test(addr) ||
    /@rma\.beisser\.cloud$/i.test(addr)
  );
  if (!isCreditsEmail) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { email_id: emailId, from, subject, text, attachments } = payload.data;
  let rmaNumber = extractRmaNumber(subject, text, toAddresses);
  if (rmaNumber === 'UNKNOWN') {
    // Subject/body had no CM/RMA number — try matching the job address to an open credit memo.
    rmaNumber = await lookupRmaByAddress(subject, text);
    console.log(`[inbound/credits] Address-based RMA lookup result: ${rmaNumber}`);
  }
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

  console.log(`[inbound/credits] ${attachments.length} attachment(s) in payload:`, attachments.map(a => ({
    filename: a.filename,
    content_type: a.content_type,
    content_disposition: a.content_disposition,
    has_content_id: !!a.content_id,
    has_inline_content: !!a.content,
    has_id: !!a.id,
  })));

  // Collect (filename, content_type, buffer) tuples from all attachment sources:
  //   1. Regular file attachments (image/pdf)
  //   2. Inline-embedded images that are large enough to be real photos (not logos)
  //   3. Nested emails (message/rfc822) whose own MIME parts contain images/pdfs
  const partsToUpload: ExtractedPart[] = [];

  for (const att of attachments) {
    // ── Nested email ──────────────────────────────────────────────────────────
    if (att.content_type === 'message/rfc822') {
      console.log('[inbound/credits] Nested email attachment detected:', att.filename);
      const rawBuffer = await fetchAttachmentBuffer(att, emailId);
      if (rawBuffer) {
        const nested = extractPartsFromRawEmail(rawBuffer.toString('binary'));
        console.log(`[inbound/credits] Extracted ${nested.length} part(s) from nested email`);
        partsToUpload.push(...nested);
      }
      continue;
    }

    // ── Regular / inline image or PDF ────────────────────────────────────────
    if (!ALLOWED_MIME.includes(att.content_type)) continue;

    // Inline-embedded parts have content_id + content_disposition=inline.
    // Skip only if the size indicates it's a small logo/icon (< 20 KB).
    // If size is unknown, capture it — better to over-capture than miss a photo.
    const isInline =
      !!att.content_id &&
      (att.content_disposition ?? '').toLowerCase().startsWith('inline');
    if (isInline && att.size !== undefined && att.size < 20000) {
      console.log(`[inbound/credits] Skipping small inline part (${att.size}B): ${att.filename}`);
      continue;
    }

    const buffer = await fetchAttachmentBuffer(att, emailId);
    if (!buffer) {
      console.warn('[inbound/credits] Could not retrieve attachment', att.filename);
      continue;
    }
    partsToUpload.push({ filename: att.filename, content_type: att.content_type, buffer });
  }

  for (const part of partsToUpload) {
    const { filename, content_type, buffer } = part;
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const r2Key = `credits/${rmaNumber}/${timestamp}-${safeFilename}`;

    // Upload to R2
    try {
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: buffer,
        ContentType: content_type,
        Metadata: {
          rma_number: rmaNumber,
          email_from: from,
        },
      }));
    } catch (err) {
      console.error('[inbound/credits] R2 upload failed', filename, err);
      continue;
    }

    // Upsert credit_images row
    try {
      await sql`
        INSERT INTO credit_images
          (rma_number, filename, filepath, email_from, email_subject, received_at, uploaded_at, r2_key)
        VALUES
          (${rmaNumber}, ${filename}, ${r2Key}, ${from}, ${subject ?? null},
           ${receivedAt.toISOString()}, NOW(), ${r2Key})
        ON CONFLICT (r2_key) DO UPDATE
          SET uploaded_at = NOW()
      `;
      uploaded++;
    } catch (err) {
      console.error('[inbound/credits] DB upsert failed', filename, err);
    }
  }

  console.log(`[inbound/credits] RMA ${rmaNumber} — ${uploaded} attachment(s) uploaded from ${from}`);
  return NextResponse.json({ ok: true, rma: rmaNumber, uploaded });
}

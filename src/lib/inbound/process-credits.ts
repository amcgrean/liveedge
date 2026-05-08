// Source-agnostic credit-memo email processor.
// Receives a NormalizedInboundEmail (produced by either Resend or Graph), runs
// RMA matching, uploads attachments to R2, and upserts public.credit_images.
//
// Behavior matches /api/inbound/credits/route.ts (the Resend handler).

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getErpSql } from '../../../db/supabase';
import type { NormalizedInboundEmail, NormalizedAttachment } from './types';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

type ExtractedPart = { filename: string; content_type: string; buffer: Buffer };

// ─── Nested .eml MIME walker (lifted from credits route) ─────────────────────
function escapeBoundary(b: string) {
  return b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractPartsFromRawEmail(raw: string): ExtractedPart[] {
  const results: ExtractedPart[] = [];

  function walk(text: string): void {
    const s = text.replace(/\r\n/g, '\n');
    const blankIdx = s.indexOf('\n\n');
    if (blankIdx === -1) return;
    const headerBlock = s.slice(0, blankIdx);
    const body = s.slice(blankIdx + 2);

    const ctRaw = headerBlock
      .match(/^content-type:\s*([^\n]+(?:\n[ \t][^\n]+)*)/im)?.[1]
      ?.replace(/\n[ \t]/g, ' ')
      .trim() ?? '';
    const ct = ctRaw.split(';')[0].trim().toLowerCase();

    if (ct.startsWith('multipart/')) {
      const bm = ctRaw.match(/boundary="?([^";]+)"?/i);
      if (!bm) return;
      const boundary = bm[1].trim();
      const re = new RegExp(`--${escapeBoundary(boundary)}(?:--)?`, 'g');
      const parts = body.split(re).slice(1);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed === '' || trimmed === '--') continue;
        walk(trimmed);
      }
      return;
    }

    if (!ALLOWED_MIME.includes(ct)) return;

    const fnMatch =
      headerBlock.match(/filename\*?="?([^"\n;]+)"?/i) ??
      headerBlock.match(/name="?([^"\n;]+)"?/i);
    const ext = ct.split('/')[1] ?? 'bin';
    const filename = fnMatch?.[1]?.trim() ?? `attachment.${ext}`;

    const enc = (headerBlock.match(/^content-transfer-encoding:\s*([^\n]+)/im)?.[1] ?? '')
      .trim().toLowerCase();
    let buffer: Buffer;
    try {
      if (enc === 'base64') {
        buffer = Buffer.from(body.replace(/\s+/g, ''), 'base64');
      } else {
        buffer = Buffer.from(body, 'binary');
      }
    } catch {
      return;
    }

    if (buffer.length > 5000) {
      results.push({ filename, content_type: ct, buffer });
    }
  }

  try {
    walk(raw);
  } catch (err) {
    console.error('[process-credits] MIME walk error', err);
  }
  return results;
}

// ─── RMA extraction ──────────────────────────────────────────────────────────
export function extractRmaNumber(subject: string | null, text: string | null, toAddresses: string[]): string {
  // Legacy: {so_id}@rma.beisser.cloud — local part IS the CM number.
  for (const addr of toAddresses) {
    const m = addr.match(/^([^@]+)@rma\.beisser\.cloud$/i);
    if (m) {
      const digits = m[1].match(/(\d{4,})/);
      if (digits) return digits[1];
    }
  }

  const sources = [subject ?? '', text?.slice(0, 500) ?? ''];
  for (const src of sources) {
    const m =
      src.match(/(?:RMA|CM)[#\s\-]?(\d{4,})/i) ??
      src.match(/(?:Credit|SO)[#\s\-]?(\d{4,})/i);
    if (m) return m[1];
  }

  const fallback = (subject ?? '').match(/\b(\d{4,})\b/);
  return fallback ? fallback[1] : 'UNKNOWN';
}

function extractAddressFragment(text: string): string | null {
  const m = text.match(
    /\b(\d{1,6}(?:\s+[NSEW]\.?)?\s+[A-Za-z][A-Za-z\s]{2,30}(?:St(?:reet)?|Ave(?:nue)?|Rd|Road|Dr(?:ive)?|Ln|Lane|Blvd|Pkwy|Hwy|Way|Ct|Court|Pl|Place|Loop|Trail|Trl|Creek|Lake|Park)\.?)\b/i
  );
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

export async function lookupRmaByAddress(subject: string | null, text: string | null): Promise<string> {
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
      console.log(`[process-credits] Address match "${fragment}" → CM ${rows[0].so_id}`);
      return rows[0].so_id;
    }

    if (rows.length > 1) {
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
          console.log(`[process-credits] Address+city match "${fragment}, ${city}" → CM ${narrowRows[0].so_id}`);
          return narrowRows[0].so_id;
        }
      }
      console.warn(`[process-credits] Address "${fragment}" matched ${rows.length} open CMs — ambiguous`);
    } else {
      console.warn(`[process-credits] Address "${fragment}" matched no open CMs`);
    }
  } catch (err) {
    console.error('[process-credits] Address lookup failed', err);
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

// ─── Main entry point ────────────────────────────────────────────────────────
export async function processCreditEmail(email: NormalizedInboundEmail): Promise<{ rma: string; uploaded: number }> {
  let rmaNumber = extractRmaNumber(email.subject, email.text, email.to);
  if (rmaNumber === 'UNKNOWN') {
    rmaNumber = await lookupRmaByAddress(email.subject, email.text);
    console.log(`[process-credits] Address-based RMA lookup result: ${rmaNumber}`);
  }

  const sql = getErpSql();

  if (email.attachments.length === 0) {
    await sql`
      INSERT INTO credit_images (rma_number, filename, filepath, email_from, email_subject, received_at, uploaded_at)
      VALUES (${rmaNumber}, '(no attachment)', '', ${email.from}, ${email.subject ?? null},
              ${email.receivedAt.toISOString()}, NOW())
    `;
    return { rma: rmaNumber, uploaded: 0 };
  }

  const r2 = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME || 'bids';
  let uploaded = 0;

  const partsToUpload: ExtractedPart[] = [];

  for (const att of email.attachments) {
    if (att.isNestedEmail) {
      const nested = extractPartsFromRawEmail(att.buffer.toString('binary'));
      console.log(`[process-credits] Extracted ${nested.length} part(s) from nested email`);
      partsToUpload.push(...nested);
      continue;
    }

    if (!ALLOWED_MIME.includes(att.contentType)) continue;

    // Skip small inline parts (signature icons, logos < 20 KB).
    const isInline = att.isInline === true || (!!att.contentId && (att.contentId !== ''));
    if (isInline && att.size !== undefined && att.size < 20000) {
      console.log(`[process-credits] Skipping small inline part (${att.size}B): ${att.filename}`);
      continue;
    }

    partsToUpload.push({
      filename:     att.filename,
      content_type: att.contentType,
      buffer:       att.buffer,
    });
  }

  for (const part of partsToUpload) {
    const safeFilename = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const r2Key = `credits/${rmaNumber}/${timestamp}-${safeFilename}`;

    try {
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: part.buffer,
        ContentType: part.content_type,
        Metadata: { rma_number: rmaNumber, email_from: email.from },
      }));
    } catch (err) {
      console.error('[process-credits] R2 upload failed', part.filename, err);
      continue;
    }

    try {
      await sql`
        INSERT INTO credit_images
          (rma_number, filename, filepath, email_from, email_subject, received_at, uploaded_at, r2_key)
        VALUES
          (${rmaNumber}, ${part.filename}, ${r2Key}, ${email.from}, ${email.subject ?? null},
           ${email.receivedAt.toISOString()}, NOW(), ${r2Key})
        ON CONFLICT (r2_key) DO UPDATE
          SET uploaded_at = NOW()
      `;
      uploaded++;
    } catch (err) {
      console.error('[process-credits] DB upsert failed', part.filename, err);
    }
  }

  console.log(`[process-credits] RMA ${rmaNumber} — ${uploaded} attachment(s) uploaded from ${email.from}`);
  return { rma: rmaNumber, uploaded };
}

// Re-export type so consumers only need one import path.
export type { NormalizedInboundEmail, NormalizedAttachment };

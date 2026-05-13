/**
 * copy-s3-to-r2.mjs
 *
 * Copies bid plan/email/attachment files from AWS S3 (pa-bid-request)
 * to Cloudflare R2 (LiveEdge), preserving the same key paths.
 *
 * Run: node scripts/copy-s3-to-r2.mjs
 *
 * Requires env vars:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME (source S3)
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (dest R2)
 */

import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// ── Source: AWS S3 ──────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const S3_BUCKET = process.env.AWS_BUCKET_NAME || 'pa-bid-request';

// ── Destination: Cloudflare R2 ──────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'bids';

// ── Files to copy (from sync script output) ─────────────────────────────────
const FILES = [
  // plan_filename fields on new bids
  '2026/RAHO1000/New/44a2c8c7d1814facb5414c74c4b21a3e_25-162_Evan_Scholar_Phi_Delta-_Combined_50_DD_1.pdf',
  '2026/EVOL1000/New/704f4c945bbe4e5087ee7d2902a80bcd_25-02400_Evolution_Properties_636_Rock_Ridge_Rd.pdf',
  '2026/CASH1100/New/6843510591c44ba7b624994a18b0f9e4_Woodruff_-_Kalona_WWTP.pdf',
  '2026/ROBE1700/New/83d4a995c59b4124b156136aa56423de_Split_Foyer.pdf',
  '2026/PINN1100/New/5c188f0745af45a0b57d4edbcb15d451_BA01_0PDF_REV_1_Fort_Dodge_6052_042926.pdf',
  '2026/IOWA3100/New/1ebdca5df8fb4bb99948993ff160bfc8_FRONT.pdf',
  '2026/CLEA1000/New/49763dcbce754e409014ed5b1b6b79dd_CCCB_-_652_Rock_Ridge.pdf',
  '2026/CASH1100/New/a092d29690f945a494e81815ff428760_Grove_Cottage_Prelim_6.9.2025.pdf',
  '2026/CASH1100/New/37eb05d4d6f14239be34e0a7d9b3d21e_Independence.1-2026.Drawings.Vol1of2.pdf',
  '2026/BUIL1100/New/49b88fee82384c08b313460788c06a7a_Woods_OTA_Budget_Pricing_Set_5.6.26.pdf',
  // bid_file attachments
  '2026/IOWA3100/New/48d97dce638a431abacbcd3ef2e4f5c6_A3.2.pdf',
  '2026/IOWA3100/New/419bd1ee3d6448c2aeb18b7c43cef92c_A4.pdf',
  '2026/CLEA1000/New/bee48677f86548feb19f07d962e85e2e_24739-A02_Layout.pdf',
  '2026/CASH1100/New/28578aef8ac14fcd9dddbe7aa9323966_Independence.1-2026.Drawings.Vol2of2.pdf',
];

// Deduplicate (9178 reuses same key as 9176)
const UNIQUE_FILES = [...new Set(FILES)];
console.log(`Files to copy: ${UNIQUE_FILES.length} (${FILES.length} refs, ${FILES.length - UNIQUE_FILES.length} deduplicated)\n`);

let copied = 0, skipped = 0, failed = 0;

for (const key of UNIQUE_FILES) {
  process.stdout.write(`  ${key.split('/').pop()} ... `);
  try {
    // Check if already exists in R2
    try {
      await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      console.log('skipped (already in R2)');
      skipped++;
      continue;
    } catch (e) {
      if (e.name !== 'NotFound' && e.$metadata?.httpStatusCode !== 404) throw e;
    }

    // Get from S3 and buffer it (PDFs are small enough)
    const getRes = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const chunks = [];
    for await (const chunk of getRes.Body) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    // Upload to R2
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: getRes.ContentType || 'application/pdf',
    }));
    console.log('✓ copied');
    copied++;
  } catch (err) {
    console.log(`✗ FAILED: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${copied} copied, ${skipped} skipped, ${failed} failed`);

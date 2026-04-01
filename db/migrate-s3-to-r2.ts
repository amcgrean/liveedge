/**
 * migrate-s3-to-r2.ts
 *
 * Copies all files from the old Flask AWS S3 bucket (beisser-bid-uploads)
 * to the new Cloudflare R2 bucket, preserving the same key paths so that
 * existing bid_file DB records continue to resolve.
 *
 * PREREQUISITES
 * -------------
 * 1. AWS credentials with s3:GetObject / s3:ListBucket on beisser-bid-uploads
 *    Either set in ~/.aws/credentials or as env vars:
 *      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (e.g. us-east-1)
 *
 * 2. R2 credentials in your environment:
 *      R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *      R2_BUCKET_NAME (defaults to "bids")
 *
 * RUN
 * ---
 *   npx tsx db/migrate-s3-to-r2.ts
 *
 * The script is idempotent — if a file already exists in R2 it is skipped.
 * Re-run safely if the process is interrupted.
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';

// ── Source: AWS S3 ───────────────────────────────────────────────────────────

const S3_BUCKET = 'beisser-bid-uploads';
const S3_REGION = process.env.AWS_REGION ?? 'us-east-1';
const DRY_RUN   = process.env.DRY_RUN === 'true';

const s3 = new S3Client({
  region: S3_REGION,
  // Credentials are picked up from env vars or ~/.aws/credentials automatically
});

// ── Destination: Cloudflare R2 ───────────────────────────────────────────────

const R2_ACCOUNT_ID  = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET      = process.env.R2_BUCKET_NAME ?? 'bids';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function existsInR2(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nMigrating files: s3://${S3_BUCKET} → r2://${R2_BUCKET}\n`);

  let continuationToken: string | undefined;
  let totalListed = 0;
  let totalCopied = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  do {
    const listResp = await s3.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listResp.Contents ?? [];
    totalListed += objects.length;

    for (const obj of objects) {
      const key = obj.Key!;
      const size = ((obj.Size ?? 0) / 1024).toFixed(1);

      // Skip already-migrated files
      if (!DRY_RUN && await existsInR2(key)) {
        console.log(`  SKIP  ${key} (already in R2)`);
        totalSkipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  DRY   ${key}  (${size} KB)`);
        totalCopied++;
        continue;
      }

      try {
        // Download from S3
        const getResp = await s3.send(
          new GetObjectCommand({ Bucket: S3_BUCKET, Key: key })
        );
        const body = await streamToBuffer(
          getResp.Body as NodeJS.ReadableStream
        );
        const contentType = getResp.ContentType ?? 'application/octet-stream';

        // Upload to R2 with same key
        await r2.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType,
          })
        );

        console.log(`  COPY  ${key}  (${size} KB)`);
        totalCopied++;
      } catch (err) {
        console.error(`  FAIL  ${key}`, err);
        totalFailed++;
      }
    }

    continuationToken = listResp.IsTruncated
      ? listResp.NextContinuationToken
      : undefined;
  } while (continuationToken);

  console.log(`
──────────────────────────────
Migration complete
  Listed : ${totalListed}
  Copied : ${totalCopied}
  Skipped: ${totalSkipped} (already in R2)
  Failed : ${totalFailed}
──────────────────────────────`);

  if (totalFailed > 0) {
    console.error('\nSome files failed — re-run to retry them.');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Env vars are read lazily inside getR2Client() — NOT at module load time.
// Reading them at the top level caused crashes in serverless environments
// when the module was imported before env vars were available, or when
// R2 wasn't configured (endpoint became "https://undefined.r2.cloudflarestorage.com").

let _client: S3Client | null = null;

function getBucketName(): string {
  return process.env.R2_BUCKET_NAME || 'bids';
}

function getR2Client(): S3Client {
  if (!_client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.'
      );
    }

    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return _client;
}

/**
 * Upload a PDF to R2. Returns the storage key.
 */
export async function uploadPdf(
  sessionId: string,
  fileName: string,
  data: Buffer | Uint8Array
): Promise<string> {
  const key = `takeoff/${sessionId}/${fileName}`;
  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: data,
      ContentType: 'application/pdf',
    })
  );

  return key;
}

/**
 * Get a presigned download URL for a PDF (valid for 1 hour).
 */
export async function getPresignedPdfUrl(key: string): Promise<string> {
  const client = getR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
    { expiresIn: 3600 }
  );
}

/**
 * Download a PDF from R2 as a buffer.
 */
export async function downloadPdf(key: string): Promise<Buffer> {
  const client = getR2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );

  const stream = response.Body;
  if (!stream) throw new Error('Empty response from R2');

  // Convert readable stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * No-op placeholder. R2 does not support PutBucketCorsCommand via the S3 API.
 * CORS must be configured manually in the Cloudflare dashboard:
 *   R2 > bids bucket > Settings > CORS policy:
 *   Allow origin: https://liveedge.vercel.app
 *   Allow methods: PUT, GET
 *   Allow headers: *
 *
 * This function is kept so existing call sites don't need to change.
 */
export async function ensureBucketCors(_allowedOrigins: string[]): Promise<void> {
  // CORS is configured in Cloudflare dashboard, not via S3 API
}

/**
 * Get a presigned upload URL for a PDF (valid for 10 minutes).
 */
export async function getPresignedUploadUrl(
  sessionId: string,
  fileName: string
): Promise<{ url: string; key: string }> {
  const key = `takeoff/${sessionId}/${fileName}`;
  const client = getR2Client();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ContentType: 'application/pdf',
    }),
    { expiresIn: 600 }
  );
  return { url, key };
}

/**
 * Delete a PDF from R2.
 */
export async function deletePdf(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );
}

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'bids';

let _client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
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
      Bucket: R2_BUCKET_NAME,
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
      Bucket: R2_BUCKET_NAME,
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
      Bucket: R2_BUCKET_NAME,
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

let _corsConfigured = false;

/**
 * Ensure CORS is configured on the R2 bucket for browser uploads.
 * Idempotent — only runs once per process lifecycle.
 */
export async function ensureBucketCors(allowedOrigins: string[]): Promise<void> {
  if (_corsConfigured) return;
  const client = getR2Client();
  await client.send(
    new PutBucketCorsCommand({
      Bucket: R2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: ['PUT', 'GET'],
            AllowedHeaders: ['*'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );
  _corsConfigured = true;
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
      Bucket: R2_BUCKET_NAME,
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
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

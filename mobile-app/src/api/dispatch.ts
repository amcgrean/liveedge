import client, { IS_DEV_MODE } from './client';
import { Route, DeliveryStop, DeliveryUpdate } from '@/types';
import { outbox, OutboxItem, PhotoUploadState } from '@/storage/outbox';

export interface DeliverBody {
  type: 'deliver' | 'skip';
  notes: string;
  photoUris: string[];
  timestamp: string;
}

interface PresignResponse {
  url: string;
  key: string;
  expiresIn: number;
}

function inferContentType(uri: string): { contentType: string; ext: string } {
  const lower = uri.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return { contentType: 'image/png', ext: 'png' };
  if (lower.endsWith('.heic')) return { contentType: 'image/heic', ext: 'heic' };
  if (lower.endsWith('.webp')) return { contentType: 'image/webp', ext: 'webp' };
  return { contentType: 'image/jpeg', ext: 'jpg' };
}

/**
 * Upload one local file:// photo to R2 via a presigned PUT.
 *
 * Step 1: ask the backend for a presigned URL keyed to this SO.
 * Step 2: stream the local file into the PUT.
 *
 * Returns the R2 key on success; throws on any failure so the caller can
 * mark the photo not-yet-uploaded and retry on the next sync pass.
 */
async function uploadOnePhoto(soNumber: string, localUri: string): Promise<string> {
  const { contentType, ext } = inferContentType(localUri);
  const presign = await client.post<PresignResponse>(
    `/api/dispatch/orders/${soNumber}/pod/upload-url`,
    { contentType, ext }
  );
  const { url, key } = presign.data;
  if (!url || !key) throw new Error('Presign response missing url/key');

  // Read the local file as a blob (RN fetch handles file:// URIs).
  const fileRes = await fetch(localUri);
  if (!fileRes.ok) throw new Error(`Failed to read local photo: ${fileRes.status}`);
  const blob = await fileRes.blob();

  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!put.ok) {
    const text = await put.text().catch(() => '');
    throw new Error(`Photo PUT ${put.status}: ${text.slice(0, 120)}`);
  }
  return key;
}

/**
 * Fetch driver's route for a specific date
 */
export async function getRoute(
  token: string,
  date: string, // YYYY-MM-DD
  branch: string
): Promise<Route> {
  const response = await client.get<Route>('/api/dispatch/routes', {
    params: { date, branch },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

/**
 * Fetch details for a specific delivery stop
 */
export async function getStop(
  token: string,
  soNumber: string
): Promise<DeliveryStop> {
  const response = await client.get<DeliveryStop>(
    `/api/dispatch/orders/${soNumber}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
}

/**
 * Update delivery status (delivered/skipped)
 */
export async function updateDeliveryStatus(
  token: string,
  soNumber: string,
  update: DeliveryUpdate
): Promise<{ success: boolean; synced_at: string }> {
  const response = await client.post(
    `/api/dispatch/orders/${soNumber}/deliver`,
    update,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
}

/**
 * Two-phase delivery sync. Used by the offline outbox sync engine.
 *
 *   Phase 1 — for each photo not yet uploaded, presign + PUT to R2.
 *             Persist remoteKey on the outbox row as each PUT lands so a
 *             mid-batch failure doesn't cost us already-uploaded photos.
 *   Phase 2 — POST to /deliver with the collected R2 keys + notes + status.
 *
 * If phase 1 partially fails, throws — sync.ts will retry on backoff and
 * the photo loop will skip anything already marked uploaded. Photos and
 * the outbox row aren't cleaned up here; sync.ts does that after the
 * deliver POST returns 2xx.
 */
export async function markDelivered(item: OutboxItem): Promise<{ photoKeys: string[] }> {
  if (IS_DEV_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (Math.random() < 0.15) throw new Error('Simulated network error');
    return { photoKeys: [] };
  }

  // Phase 1 — upload any not-yet-uploaded photos.
  const uploads: PhotoUploadState[] = item.photoUploads
    ?? item.photoUris.map((uri) => ({ uri, uploaded: false }));

  for (let i = 0; i < uploads.length; i++) {
    const u = uploads[i];
    if (u.uploaded && u.remoteKey) continue;
    const key = await uploadOnePhoto(item.soNumber, u.uri);
    uploads[i] = { uri: u.uri, remoteKey: key, uploaded: true };
    // Persist incremental progress so a crash/kill before all uploads finish
    // doesn't force a re-upload of the photos that already landed.
    await outbox.update(item.id, { photoUploads: [...uploads] });
  }

  const photoKeys = uploads
    .map((u) => u.remoteKey)
    .filter((k): k is string => Boolean(k));

  // Phase 2 — mark delivered. Body shape matches the (extended) /deliver route.
  await client.post(`/api/dispatch/orders/${item.soNumber}/deliver`, {
    type: item.type,
    status: item.type === 'skip' ? 'skipped' : 'delivered',
    notes: item.notes,
    timestamp: new Date().toISOString(),
    photo_keys: photoKeys,
  });

  return { photoKeys };
}

/**
 * Upload proof-of-delivery photos
 */
export async function submitPOD(
  token: string,
  soNumber: string,
  formData: FormData
): Promise<{ success: boolean; photo_ids: string[]; uploaded_at: string }> {
  const response = await client.post(
    `/api/dispatch/orders/${soNumber}/pod`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
}

/**
 * Get KPI metrics for branch
 */
export async function getKPIs(
  token: string,
  branch: string,
  date: string
): Promise<{
  total_stops: number;
  completed: number;
  skipped: number;
  pending: number;
  completion_rate: number;
}> {
  const response = await client.get('/api/dispatch/kpis', {
    params: { branch, date },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

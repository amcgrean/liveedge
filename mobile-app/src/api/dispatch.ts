import client, { IS_DEV_MODE } from './client';
import { Route, DeliveryStop, DeliveryUpdate } from '@/types';
import { outbox, OutboxItem, PhotoUploadState } from '@/storage/outbox';

export interface DeliverBody {
  type: 'deliver' | 'skip';
  notes: string;
  photoUris: string[];
  timestamp: string;
}

export interface OrderLookupStop {
  id: number;
  route_id: number;
  shipment_num: number;
  status: string;
  notes: string | null;
  route_date?: string;
  route_name?: string;
  branch_code?: string;
}

export interface OrderLineRow {
  sequence: number | null;
  item_code: string | null;
  description: string | null;
  size: string | null;
  qty_ordered: number | null;
  qty_shipped: number | null;
  qty_on_hand: number | null;
  price: number | null;
  uom: string | null;
  handling_code: string | null;
  extended_price: number | null;
  unshipped_extended_price: number | null;
}

export interface OrderLinesResult {
  lines: OrderLineRow[];
  /**
   * Server-derived flag mirroring `pricing.view`. When false, price /
   * extended_price / unshipped_extended_price are null on every row and
   * the UI should hide the $ column entirely. Authoritative — never
   * second-guess client-side.
   */
  pricingVisible: boolean;
}

/**
 * Fetch line items for an SO from the dispatch /lines endpoint. Branch is
 * required by the server to scope inventory; if omitted the caller's
 * session branch is used server-side.
 */
export async function fetchOrderLines(soNumber: string, branchCode?: string): Promise<OrderLinesResult> {
  if (IS_DEV_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { lines: [], pricingVisible: false };
  }
  const res = await client.get<{ lines: OrderLineRow[]; pricing_visible?: boolean }>(
    `/api/dispatch/orders/${encodeURIComponent(soNumber)}/lines`,
    { params: branchCode ? { branch: branchCode } : undefined }
  );
  return {
    lines: res.data?.lines ?? [],
    pricingVisible: res.data?.pricing_visible === true,
  };
}

export interface AgilityShipmentInfo {
  shipment_num: number;
  ship_date: string | null;
  expect_date: string | null;
  /** Single-char ERP status: B=Open, K=Picked, S=Staged, P=Picked-up, D=Delivered, I=Invoiced, C=Cancelled */
  status_flag: string | null;
  status_flag_delivery: string | null;
  route_id_char: string | null;
  driver: string | null;
}

export interface OrderLookupResponse {
  so: {
    so_id: string;
    branch_code: string;
    customer_name: string | null;
    cust_code: string | null;
    address_1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    reference: string | null;
    po_number: string | null;
    ship_via: string | null;
    so_status: string | null;
    sale_type: string | null;
    created_date: string | null;
    shipto_seq_num: number | null;
    line_count: number;
    ext_total: number | null;
  };
  existing_stop: OrderLookupStop | null;
  agility_shipment: AgilityShipmentInfo | null;
}

/**
 * Look up an SO by number. Returns header data plus an existing dispatch
 * stop if the SO is already scheduled. The mobile app uses this to power
 * the search-by-SO# flow from the top bar.
 */
export async function lookupOrder(soNumber: string): Promise<OrderLookupResponse> {
  if (IS_DEV_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    // Dev mode: synthesize a plausible response so the UI can be exercised.
    return {
      so: {
        so_id: soNumber,
        branch_code: '20GR',
        customer_name: 'Dev Customer ' + soNumber,
        cust_code: 'DEV1000',
        address_1: '1 Dev Lane',
        city: 'Grimes',
        state: 'IA',
        zip: '50111',
        reference: 'DEV-' + soNumber,
        po_number: null,
        ship_via: 'TRUCK',
        so_status: 'O',
        sale_type: 'Direct',
        created_date: new Date().toISOString().slice(0, 10),
        shipto_seq_num: 1,
        line_count: 0,
        ext_total: null,
      },
      existing_stop: null,
      agility_shipment: null,
    };
  }
  const res = await client.get<OrderLookupResponse>(`/api/dispatch/orders/${encodeURIComponent(soNumber)}`);
  return res.data;
}

export interface ClaimOrderResponse {
  claimed: boolean;
  already_existed: boolean;
  stop: OrderLookupStop;
}

/**
 * Claim an SO so the caller can submit POD photos and mark it delivered.
 * Server creates a per-user-per-day ad-hoc dispatch_route_stops row if
 * the SO isn't already on a route.
 */
export async function claimOrder(
  soNumber: string,
  body: { branchCode?: string; shipmentNum?: number; notes?: string } = {}
): Promise<ClaimOrderResponse> {
  if (IS_DEV_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      claimed: true,
      already_existed: false,
      stop: { id: 9999, route_id: 9998, shipment_num: 1, status: 'pending', notes: 'dev claim' },
    };
  }
  const res = await client.post<ClaimOrderResponse>(
    `/api/dispatch/orders/${encodeURIComponent(soNumber)}/claim`,
    body
  );
  return res.data;
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
    if (!item.soNumber) throw new Error('Missing SO number');
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
  if (!item.soNumber) throw new Error('Missing SO number');
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

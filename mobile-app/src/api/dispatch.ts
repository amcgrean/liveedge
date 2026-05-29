import client from './client';
import { Route, DeliveryStop, DeliveryUpdate } from '@/types';

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

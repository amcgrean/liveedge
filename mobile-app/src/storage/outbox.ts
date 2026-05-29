import AsyncStorage from '@react-native-async-storage/async-storage';
import { PendingDelivery } from '@/types';
import uuid from 'uuid';

const OUTBOX_KEY = 'delivery_outbox';

/**
 * Queue a delivery update for sync
 */
export async function addPendingDelivery(
  soNumber: string,
  status: 'delivered' | 'skipped',
  notes?: string,
  photoCount: number = 0
): Promise<string> {
  const pending: PendingDelivery = {
    id: uuid.v4(),
    so_number: soNumber,
    status,
    notes,
    photos: [],
    createdAt: Date.now(),
  };

  const outbox = await getPendingDeliveries();
  outbox.push(pending);

  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  return pending.id;
}

/**
 * Get all pending deliveries
 */
export async function getPendingDeliveries(): Promise<PendingDelivery[]> {
  const data = await AsyncStorage.getItem(OUTBOX_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Mark a delivery as synced
 */
export async function markSynced(pendingId: string): Promise<void> {
  const outbox = await getPendingDeliveries();
  const updated = outbox.map((p) =>
    p.id === pendingId ? { ...p, syncedAt: Date.now() } : p
  );
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(updated));
}

/**
 * Remove a synced delivery from outbox
 */
export async function removePending(pendingId: string): Promise<void> {
  const outbox = await getPendingDeliveries();
  const filtered = outbox.filter((p) => p.id !== pendingId);
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(filtered));
}

/**
 * Update error for a pending delivery (retry tracking)
 */
export async function setPendingError(pendingId: string, error: string): Promise<void> {
  const outbox = await getPendingDeliveries();
  const updated = outbox.map((p) =>
    p.id === pendingId ? { ...p, error } : p
  );
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(updated));
}

/**
 * Clear all pending deliveries (for testing)
 */
export async function clearOutbox(): Promise<void> {
  await AsyncStorage.removeItem(OUTBOX_KEY);
}

/**
 * Get count of pending deliveries
 */
export async function getPendingCount(): Promise<number> {
  const pending = await getPendingDeliveries();
  return pending.filter((p) => !p.syncedAt).length;
}

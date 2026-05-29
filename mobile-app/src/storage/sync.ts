import { useAuth } from '@/context/AuthContext';
import * as dispatchAPI from '@/api/dispatch';
import * as outbox from './outbox';
import { DeliveryStop } from '@/types';

interface SyncOptions {
  maxRetries?: number;
  retryDelay?: number; // ms
  token: string;
}

/**
 * Retry with exponential backoff
 * 1s, 5s, 30s, 5m
 */
function getRetryDelay(attempt: number): number {
  const delays = [1000, 5000, 30000, 5 * 60 * 1000];
  return delays[Math.min(attempt, delays.length - 1)];
}

/**
 * Sync all pending deliveries
 */
export async function syncPendingDeliveries(options: SyncOptions): Promise<{
  synced: number;
  failed: number;
  errors: Record<string, string>;
}> {
  const { token, maxRetries = 3 } = options;
  const pending = await outbox.getPendingDeliveries();
  const unsynced = pending.filter((p) => !p.syncedAt);

  let synced = 0;
  let failed = 0;
  const errors: Record<string, string> = {};

  for (const delivery of unsynced) {
    try {
      // Attempt sync with retries
      let attempt = 0;
      let lastError: Error | null = null;

      while (attempt < maxRetries) {
        try {
          await dispatchAPI.updateDeliveryStatus(token, delivery.so_number, {
            status: delivery.status,
            notes: delivery.notes,
            timestamp: new Date(delivery.createdAt).toISOString(),
            photo_count: delivery.photos.filter((p) => p.uploaded).length,
          });

          // Success - mark as synced
          await outbox.markSynced(delivery.id);
          synced++;
          break;
        } catch (error) {
          lastError = error as Error;
          attempt++;

          if (attempt < maxRetries) {
            // Wait before retry
            const delay = getRetryDelay(attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      if (lastError && attempt >= maxRetries) {
        failed++;
        errors[delivery.so_number] = lastError.message;
        await outbox.setPendingError(delivery.id, lastError.message);
      }
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      errors[delivery.so_number] = msg;
      await outbox.setPendingError(delivery.id, msg);
    }
  }

  return { synced, failed, errors };
}

/**
 * Set up background sync (Phase 5+)
 * This would use expo-background-fetch to sync periodically
 */
export async function registerBackgroundSync(): Promise<void> {
  // Implementation for Phase 5
  // Would use expo-background-fetch to sync every 15 minutes
  // and expo-task-manager to handle background tasks
}

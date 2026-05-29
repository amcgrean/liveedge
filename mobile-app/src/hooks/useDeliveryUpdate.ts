import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as dispatchAPI from '@/api/dispatch';
import * as outbox from '@/storage/outbox';
import { DeliveryStop } from '@/types';

interface UpdateResult {
  success: boolean;
  queued?: boolean;
  error?: string;
}

export function useDeliveryUpdate() {
  const { session } = useAuth();
  const { show: showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const updateDelivery = useCallback(
    async (
      stop: DeliveryStop,
      status: 'delivered' | 'skipped',
      notes?: string
    ): Promise<UpdateResult> => {
      if (!session?.token) {
        showToast('Not authenticated', 'error');
        return { success: false, error: 'Not authenticated' };
      }

      setIsLoading(true);

      try {
        const timestamp = new Date().toISOString();

        // Try to sync immediately
        try {
          await dispatchAPI.updateDeliveryStatus(session.token, stop.so_number, {
            status,
            notes,
            timestamp,
            photo_count: 0,
          });

          showToast(
            `✓ Marked ${status === 'delivered' ? 'delivered' : 'skipped'}`,
            'success'
          );
          return { success: true };
        } catch (syncError) {
          // Network error - queue for later
          if (syncError instanceof Error && syncError.message.includes('Network')) {
            const pendingId = await outbox.addPendingDelivery(
              stop.so_number,
              status,
              notes
            );

            showToast(
              'No connection - saved offline. Will sync when online.',
              'info',
              4000
            );

            return { success: true, queued: true };
          }

          // Other error - fail
          throw syncError;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update delivery';
        showToast(message, 'error');
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [session, showToast]
  );

  return { updateDelivery, isLoading };
}

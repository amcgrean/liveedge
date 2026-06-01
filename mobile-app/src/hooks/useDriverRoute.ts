import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import client, { IS_DEV_MODE } from '@/api/client';
import { MOCK_STOPS, MockStop } from '@/data/mockRoute';
import { mapServerResponseToStops, ServerRoutesResponse } from '@/data/routeMapper';
import { useAuth } from '@/context/AuthContext';
import { useOutbox } from '@/storage/outbox';

/** MockStop plus the server-side ids the deliver call needs. */
export type DriverStop = MockStop & {
  stopId?: number;
  routeId?: number;
  shipmentNum?: number;
  branchCode?: string;
};

export interface DriverRouteState {
  stops: DriverStop[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

/**
 * Fetch the driver's stops for today. In dev mode (no EXPO_PUBLIC_BACKEND_URL)
 * returns MOCK_STOPS so the rest of the app keeps working offline.
 *
 * Single-tenant per render — every screen calling this gets its own state.
 * That's fine in practice: the LiveEdge dispatch routes API is fast and the
 * pull-to-refresh on the list screen is the only place that drives a refresh.
 */
export function useDriverRoute(): DriverRouteState {
  const { user } = useAuth();
  const branch = user?.branch || '20GR';
  const [rawStops, setRawStops] = useState<DriverStop[]>(IS_DEV_MODE ? MOCK_STOPS : []);
  const [loading, setLoading] = useState(!IS_DEV_MODE);
  const [error, setError] = useState<string | null>(null);
  const outboxItems = useOutbox();

  const load = useCallback(async () => {
    if (IS_DEV_MODE) {
      setRawStops(MOCK_STOPS);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await client.get<ServerRoutesResponse>('/api/dispatch/routes', {
        params: { date: todayStr(), branch, include: 'stops' },
      });
      setRawStops(mapServerResponseToStops(res.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load route';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    load();
  }, [load]);

  // Reconciliation: overlay pending outbox items onto server data.
  //
  // - If a pending outbox row says "deliver" for an SO the server still
  //   reports pending, render the stop as delivered. Cleared automatically
  //   once sync completes (sync.ts removes synced rows).
  // - If the server already reports delivered/skipped, server wins — even if
  //   the outbox is mid-retry, the user wants to see the canonical truth.
  // - Synced outbox rows are removed by sync.ts, so this hook never sees them.
  const stops = useMemo<DriverStop[]>(() => {
    if (outboxItems.length === 0) return rawStops;
    const pendingBySo = new Map<string, 'delivered' | 'skipped'>();
    for (const it of outboxItems) {
      if (it.status === 'synced') continue;
      if (!it.soNumber) continue;
      pendingBySo.set(it.soNumber, it.type === 'skip' ? 'skipped' : 'delivered');
    }
    if (pendingBySo.size === 0) return rawStops;
    return rawStops.map((s) => {
      const override = pendingBySo.get(s.so);
      // Server-confirmed terminal states are authoritative.
      if (!override || s.status === 'delivered' || s.status === 'skipped') return s;
      return { ...s, status: override };
    });
  }, [rawStops, outboxItems]);

  return { stops, loading, error, refresh: load };
}

import { useEffect, useState } from 'react';
import { useDriverRoute, DriverStop } from './useDriverRoute';
import { lookupOrder, OrderLookupResponse } from '@/api/dispatch';
import { StopStatus } from '@/data/mockRoute';

/**
 * Resolve a stop for the delivery-details screen.
 *
 * Order of resolution:
 *   1. If the SO is on today's route (useDriverRoute), use that — gives
 *      the canonical stop number, status, and serverIds.
 *   2. Otherwise fall back to GET /api/dispatch/orders/[so] (lookup
 *      endpoint) and synthesize a DriverStop-shaped object so the rest
 *      of the screen renders unchanged.
 *
 * Returns { stop, source, loading, error, idx, total, refresh } where
 * source = 'route' | 'lookup' | null.
 */
export interface UseStopOrLookupResult {
  stop: DriverStop | null;
  source: 'route' | 'lookup' | null;
  loading: boolean;
  error: string | null;
  idx: number;        // -1 if not on route
  total: number;
  refresh: () => Promise<void>;
}

function mapLookupToStop(payload: OrderLookupResponse): DriverStop {
  const so = payload.so;
  const existing = payload.existing_stop;
  const status: StopStatus =
    existing?.status === 'delivered' ? 'delivered'
    : existing?.status === 'skipped' ? 'skipped'
    : existing?.status === 'inroute' ? 'inroute'
    : 'pending';
  const addr2 = [so.city, [so.state, so.zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return {
    n: '—',
    so: so.so_id,
    name: so.customer_name ?? so.cust_code ?? `SO ${so.so_id}`,
    addr1: so.address_1 ?? '',
    addr2,
    status,
    items: so.line_count ?? 0,
    poRef: so.reference ?? undefined,
    notes: existing?.notes ?? undefined,
    stopId: existing?.id,
    routeId: existing?.route_id,
    shipmentNum: existing?.shipment_num,
    branchCode: so.branch_code,
  };
}

export function useStopOrLookup(soNumber: string): UseStopOrLookupResult {
  const { stops, loading: routeLoading } = useDriverRoute();
  const onRoute = stops.find((s) => s.so === soNumber);
  const idx = onRoute ? stops.findIndex((s) => s.so === soNumber) : -1;

  const [lookupStop, setLookupStop] = useState<DriverStop | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const fetchLookup = async () => {
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await lookupOrder(soNumber);
      setLookupStop(mapLookupToStop(res));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lookup failed';
      setLookupError(msg);
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    // Only do a lookup once the route load has settled AND the SO isn't on it.
    if (routeLoading) return;
    if (onRoute) {
      setLookupStop(null);
      setLookupError(null);
      return;
    }
    fetchLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLoading, soNumber, onRoute]);

  if (onRoute) {
    return {
      stop: onRoute,
      source: 'route',
      loading: false,
      error: null,
      idx,
      total: stops.length,
      refresh: async () => {},
    };
  }
  return {
    stop: lookupStop,
    source: lookupStop ? 'lookup' : null,
    loading: routeLoading || lookupLoading,
    error: lookupError,
    idx: -1,
    total: stops.length,
    refresh: fetchLookup,
  };
}

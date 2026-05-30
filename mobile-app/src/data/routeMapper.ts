import { MockStop, StopStatus } from './mockRoute';

/**
 * Server response shape from GET /api/dispatch/routes?include=stops.
 * Fields the API doesn't carry yet (foreman contacts, gate codes, line items)
 * stay undefined on the resulting MockStop — every screen already guards
 * against missing values.
 */
export interface ServerStop {
  id: number;
  so_id: string;
  shipment_num: number;
  sequence: number;
  status: string;
  notes: string | null;
  customer_name: string | null;
  cust_code: string | null;
  address_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  reference: string | null;
  ship_via: string | null;
  so_status: string | null;
}

export interface ServerRoute {
  id: number;
  route_date: string;
  route_name: string;
  branch_code: string;
  driver_name: string | null;
  truck_id: string | null;
  status: string | null;
  notes: string | null;
  stop_count: number;
  stops: ServerStop[];
}

export interface ServerRoutesResponse {
  routes: ServerRoute[];
}

function mapStatus(s: string | null | undefined): StopStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'delivered':
      return 'delivered';
    case 'skipped':
      return 'skipped';
    case 'inroute':
    case 'in_route':
    case 'in-route':
    case 'enroute':
    case 'en_route':
      return 'inroute';
    default:
      return 'pending';
  }
}

function buildAddr2(stop: ServerStop): string {
  const parts: string[] = [];
  if (stop.city) parts.push(stop.city);
  const tail = [stop.state, stop.zip].filter(Boolean).join(' ');
  if (tail) parts.push(tail);
  return parts.join(', ');
}

/**
 * Convert one server route's stops to the MockStop[] shape the screens expect.
 * `stopId` and `routeId` are stashed on the result so the deliver call can
 * find the right server-side row without a second round trip.
 */
export function mapServerRouteToStops(route: ServerRoute): (MockStop & {
  stopId: number;
  routeId: number;
  shipmentNum: number;
  branchCode: string;
})[] {
  return route.stops.map((s, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    return {
      n: num,
      so: s.so_id,
      name: s.customer_name?.trim() || s.cust_code?.trim() || `SO ${s.so_id}`,
      addr1: s.address_1?.trim() ?? '',
      addr2: buildAddr2(s),
      status: mapStatus(s.status),
      items: 0, // Line count not on server response yet — populated by detail fetch.
      poRef: s.reference ?? undefined,
      notes: s.notes ?? undefined,
      stopId: s.id,
      routeId: route.id,
      shipmentNum: s.shipment_num,
      branchCode: route.branch_code,
    };
  });
}

/** Flatten every stop across every returned route for the date. */
export function mapServerResponseToStops(resp: ServerRoutesResponse | undefined | null): (MockStop & {
  stopId: number;
  routeId: number;
  shipmentNum: number;
  branchCode: string;
})[] {
  if (!resp?.routes?.length) return [];
  return resp.routes.flatMap(mapServerRouteToStops);
}

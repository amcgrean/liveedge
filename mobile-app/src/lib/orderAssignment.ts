import { OrderLookupResponse } from '@/api/dispatch';

/**
 * Map ERP single-character status flags to a human label + pill-friendly kind.
 *
 *   B = Open / blank
 *   K = Picked (warehouse pulled inventory)
 *   S = Staged (loaded for delivery)
 *   P = Picked-up / in transit
 *   D = Delivered
 *   I = Invoiced
 *   C = Cancelled
 *
 * `kind` matches the existing Pill component variants ('pending' / 'inroute'
 * / 'delivered' / 'skipped') so callers can pass it straight through.
 */
export function describeErpStatus(soStatus: string | null, statusFlag: string | null): { label: string; kind: 'pending' | 'inroute' | 'delivered' | 'skipped' } {
  const code = (statusFlag ?? soStatus ?? '').toUpperCase().trim();
  switch (code) {
    case 'I': return { label: 'INVOICED', kind: 'delivered' };
    case 'D': return { label: 'DELIVERED', kind: 'delivered' };
    case 'P': return { label: 'IN TRANSIT', kind: 'inroute' };
    case 'S': return { label: 'STAGED', kind: 'inroute' };
    case 'K': return { label: 'PICKED', kind: 'pending' };
    case 'C': return { label: 'CANCELLED', kind: 'skipped' };
    case 'B':
    case 'N':
    case '':
    default: return { label: 'OPEN', kind: 'pending' };
  }
}

/**
 * Render-ready summary of who's on the hook for an SO. Combines the LiveEdge
 * dispatch_route_stops row (if any) with the Agility shipment row (the
 * actual source of truth at Beisser).
 */
export interface AssignmentSummary {
  /** Display label, e.g. "STAGED" / "DELIVERED" / "OPEN". */
  statusLabel: string;
  statusKind: 'pending' | 'inroute' | 'delivered' | 'skipped';
  /** Free-form one-liner: "Staged to myronj · ship 6/1/2026". Null = unassigned. */
  assignmentLine: string | null;
  /** True only when LiveEdge can safely create a per-user stop for the caller. */
  canClaim: boolean;
  /** True when status is a terminal state (delivered / invoiced / cancelled). */
  isTerminal: boolean;
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  // iso is like "2026-06-01T00:00:00+00:00" or "2026-06-01"
  const date = iso.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return iso;
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1]}`;
}

export function describeAssignment(payload: OrderLookupResponse): AssignmentSummary {
  const ship = payload.agility_shipment;
  const stop = payload.existing_stop;
  const so = payload.so;

  // ERP status takes precedence — it's the canonical truth.
  const { label, kind } = describeErpStatus(so.so_status, ship?.status_flag ?? null);
  const isTerminal = ['DELIVERED', 'INVOICED', 'CANCELLED'].includes(label);

  // Assignment line. Prefer driver+ship_date when present; fall back to
  // route_id_char; otherwise check the LiveEdge stop's route name.
  let assignmentLine: string | null = null;
  if (ship?.driver) {
    const date = shortDate(ship.ship_date) ?? shortDate(ship.expect_date);
    assignmentLine = `${label === 'OPEN' ? 'Assigned' : label.charAt(0) + label.slice(1).toLowerCase()} to ${ship.driver}${date ? ` · ship ${date}` : ''}`;
  } else if (ship?.route_id_char) {
    const date = shortDate(ship.ship_date) ?? shortDate(ship.expect_date);
    assignmentLine = `On route ${ship.route_id_char}${date ? ` · ship ${date}` : ''}`;
  } else if (stop?.route_name) {
    assignmentLine = `On route: ${stop.route_name}${stop.route_date ? ` · ${shortDate(stop.route_date)}` : ''}`;
  }

  // Claim rule: only claimable when no driver/route assignment AND not terminal.
  // Even an "OPEN" SO with no driver shouldn't be claimable if it's already
  // on a dispatch route stop — that's a real assignment.
  const hasAssignment = Boolean(ship?.driver || ship?.route_id_char || stop);
  const canClaim = !hasAssignment && !isTerminal;

  return {
    statusLabel: label,
    statusKind: kind,
    assignmentLine,
    canClaim,
    isTerminal,
  };
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyDispatchSyncToken } from '../../../../src/lib/service-auth';
import { notifyAgilityRouteCompleted } from '../../../../src/lib/dispatch/route-completion';

// POST /api/dispatch/agility-route-complete
//
// Called by the Pi-side reconciler when every shipment in a
// (system_id, ship_date, route_id_char, driver) group on agility_shipments
// is delivered. Completion is judged on status_flag IN ('D','I')
// (D=delivered, I=invoiced/past-delivered) — NOT status_flag_delivery,
// which is unpopulated in the mirror sync. LiveEdge fires the configured
// per-branch alerts and writes one log row per (recipient, channel).
//
// Bearer auth via DISPATCH_SYNC_TOKEN env var.
//
// Request body:
//   {
//     systemId:         "20GR",        // = branch code on agility_shipments
//     shipDate:         "2026-05-27",  // yyyy-mm-dd
//     routeIdChar:      "07" | null,   // agility_shipments.route_id_char (may be empty)
//     driver:           "Joe Smith" | null,
//     shipmentCount:    5,
//     soIds:            ["1480288","1480299", ...]  // informational; first 5 shown in the alert
//   }
//
// The Pi can POST the same payload repeatedly — LiveEdge dedupes by looking
// up prior terminal-status log rows for the same Agility tuple before
// invoking the email/SMS provider. Failed sends are retried on the next
// POST.

interface AgilityRouteCompleteBody {
  systemId:      unknown;
  shipDate:      unknown;
  routeIdChar?:  unknown;
  driver?:       unknown;
  shipmentCount: unknown;
  soIds?:        unknown;
  stops?:        unknown;
}

// Real routes are 1–30 stops; cap generously and ignore overflow.
const MAX_STOPS = 200;

export async function POST(req: NextRequest) {
  const authErr = verifyDispatchSyncToken(req);
  if (authErr) return authErr;

  let raw: AgilityRouteCompleteBody;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const validation = validate(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  try {
    const outcome = await notifyAgilityRouteCompleted(validation.value);
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    console.error('[agility-route-complete] notify failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface ValidatedStop {
  soId:     string;
  saleType: string;
  customer: string;
  address1: string;
  city:     string;
  state:    string;
  zip:      string;
}

interface ValidatedPayload {
  systemId:         string;
  agilityShipDate:  string;
  agilityRouteCode: string | null;
  driver:           string | null;
  shipmentCount:    number;
  soIds:            string[];
  stops?:           ValidatedStop[];
}

// Coerce any value to a trimmed string; non-strings (numbers, null) become "".
function asTrimmedString(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

function validate(
  body: AgilityRouteCompleteBody,
): { ok: true; value: ValidatedPayload } | { ok: false; error: string } {
  const systemId = typeof body.systemId === 'string' ? body.systemId.trim() : '';
  if (!systemId) return { ok: false, error: 'systemId is required' };

  const shipDate = typeof body.shipDate === 'string' ? body.shipDate.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shipDate)) {
    return { ok: false, error: 'shipDate must be yyyy-mm-dd' };
  }

  const routeIdCharRaw = typeof body.routeIdChar === 'string' ? body.routeIdChar.trim() : '';
  const agilityRouteCode = routeIdCharRaw || null;

  const driverRaw = typeof body.driver === 'string' ? body.driver.trim() : '';
  const driver = driverRaw || null;

  const shipmentCount = typeof body.shipmentCount === 'number'
    ? body.shipmentCount
    : Number(body.shipmentCount);
  if (!Number.isFinite(shipmentCount) || shipmentCount < 1) {
    return { ok: false, error: 'shipmentCount must be >= 1' };
  }

  let soIds: string[] = [];
  if (Array.isArray(body.soIds)) {
    soIds = body.soIds
      .map((x) => (typeof x === 'string' ? x.trim() : String(x ?? '').trim()))
      .filter((x) => x.length > 0);
  }

  // At least one of route_id_char or driver must be present so the dedupe
  // key is meaningful — otherwise two unrelated loads on the same day at
  // the same branch would collapse.
  if (!agilityRouteCode && !driver) {
    return { ok: false, error: 'Either routeIdChar or driver must be present' };
  }

  // Optional enriched per-stop detail. Absent/empty on older Pi builds —
  // the email falls back to the header-only layout in that case.
  let stops: ValidatedStop[] | undefined;
  if (body.stops !== undefined && body.stops !== null) {
    if (!Array.isArray(body.stops)) {
      return { ok: false, error: 'stops must be an array' };
    }
    if (body.stops.length > MAX_STOPS) {
      return { ok: false, error: `stops cannot exceed ${MAX_STOPS} entries` };
    }
    const parsed: ValidatedStop[] = [];
    for (const s of body.stops) {
      if (typeof s !== 'object' || s === null) {
        return { ok: false, error: 'each stop must be an object' };
      }
      const stop = s as Record<string, unknown>;
      parsed.push({
        soId:     asTrimmedString(stop.soId),
        saleType: asTrimmedString(stop.saleType),
        customer: asTrimmedString(stop.customer),
        address1: asTrimmedString(stop.address1),
        city:     asTrimmedString(stop.city),
        state:    asTrimmedString(stop.state),
        zip:      asTrimmedString(stop.zip),
      });
    }
    stops = parsed;
  }

  return {
    ok: true,
    value: {
      systemId,
      agilityShipDate: shipDate,
      agilityRouteCode,
      driver,
      shipmentCount,
      soIds,
      ...(stops ? { stops } : {}),
    },
  };
}

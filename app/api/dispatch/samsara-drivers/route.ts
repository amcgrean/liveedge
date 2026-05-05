import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';

const SAMSARA_BASE = 'https://api.samsara.com';

// 5-minute in-process cache per cold start
let _cache: { ts: number; data: SamsaraDriver[] } = { ts: 0, data: [] };

export type SamsaraDriver = {
  id: string;
  name: string;
  username: string;
  staticVehicleId: string | null;
  staticVehicleName: string | null;
};

// GET /api/dispatch/samsara-drivers
// Returns active Samsara drivers with usernames (used for auto-matching route codes).
export async function GET() {
  const authResult = await requireCapability('dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ drivers: [] });

  const now = Date.now() / 1000;
  if (_cache.data.length && now - _cache.ts < 300) {
    return NextResponse.json({ drivers: _cache.data });
  }

  try {
    const res = await fetch(
      `${SAMSARA_BASE}/fleet/drivers?limit=200&driverActivationStatus=active`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!res.ok) {
      console.error('[dispatch/samsara-drivers] Samsara error', res.status, await res.text());
      return NextResponse.json({ drivers: _cache.data }); // return stale on error
    }

    type RawDriver = {
      id: string;
      name: string;
      username?: string;
      staticAssignedVehicle?: { id: string; name: string };
    };

    const payload = await res.json() as { data?: RawDriver[] };
    const drivers: SamsaraDriver[] = (payload.data ?? [])
      .filter((d) => d.username)
      .map((d) => ({
        id: d.id,
        name: d.name,
        username: d.username!,
        staticVehicleId: d.staticAssignedVehicle?.id ?? null,
        staticVehicleName: d.staticAssignedVehicle?.name ?? null,
      }));

    _cache = { ts: now, data: drivers };
    return NextResponse.json({ drivers });
  } catch (err) {
    console.error('[dispatch/samsara-drivers GET]', err);
    return NextResponse.json({ drivers: _cache.data });
  }
}

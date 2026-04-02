import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';

// Simple in-process cache (per cold start)
let _cache: { ts: number; data: unknown } = { ts: 0, data: null };

const SAMSARA_BASE = 'https://api.samsara.com';

// GET /api/dispatch/vehicles?branch=20GR
// Proxies Samsara fleet/vehicles/locations with branch filtering and short-term cache.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: 'Samsara not configured' }, { status: 503 });

  const branchParam = (req.nextUrl.searchParams.get('branch') ?? '').toUpperCase();
  const ttlSec = Math.max(5, parseInt(process.env.SAMSARA_CACHE_TTL ?? '15', 10));

  try {
    // Use cached data if fresh
    const now = Date.now() / 1000;
    if (_cache.data && now - _cache.ts < ttlSec) {
      const vehicles = filterVehicles(_cache.data, branchParam);
      return NextResponse.json(vehicles);
    }

    const res = await fetch(`${SAMSARA_BASE}/fleet/vehicles/locations?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      console.error('[dispatch/vehicles] Samsara error', res.status, await res.text());
      return NextResponse.json({ error: 'Samsara API error' }, { status: 502 });
    }

    const payload = await res.json() as unknown;
    _cache = { ts: now, data: payload };

    return NextResponse.json(filterVehicles(payload, branchParam));
  } catch (err) {
    console.error('[dispatch/vehicles GET]', err);
    return NextResponse.json({ error: 'Failed to fetch vehicle locations' }, { status: 500 });
  }
}

function filterVehicles(payload: unknown, branch: string) {
  const vehicleMap = parseVehicleMap();

  // Samsara response: { data: [{ id, name, location: { latitude, longitude, ... } }] }
  type VehicleRaw = {
    id: string;
    name: string;
    location?: {
      latitude?: number;
      longitude?: number;
      speed?: number;
      heading?: number;
      time?: string;
      reverseGeo?: { formattedLocation?: string };
    };
  };

  const raw = (payload as { data?: VehicleRaw[] })?.data ?? [];

  const vehicles = raw.map((v) => ({
    id: v.id,
    name: v.name,
    branch_code: vehicleMap[v.id.toUpperCase()] ?? null,
    latitude: v.location?.latitude ?? null,
    longitude: v.location?.longitude ?? null,
    speed: v.location?.speed ?? null,
    heading: v.location?.heading ?? null,
    time: v.location?.time ?? null,
    address: v.location?.reverseGeo?.formattedLocation ?? null,
  }));

  if (branch) {
    return vehicles.filter((v) => v.branch_code === branch);
  }
  return vehicles;
}

function parseVehicleMap(): Record<string, string> {
  try {
    const raw = process.env.SAMSARA_VEHICLE_BRANCH_MAP ?? '{}';
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()])
    );
  } catch {
    return {};
  }
}

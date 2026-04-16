'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { DeliveryStop } from '../../../app/api/dispatch/deliveries/route';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DispatchMapRoute {
  id: number;
  route_name: string;
  branch_code: string;
  driver_name: string | null;
}

export interface DispatchMapRouteStop {
  id: number;
  route_id: number;
  so_id: string;
  sequence: number;
}

interface Vehicle {
  id: string;
  name: string;
  branch_code: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  time: string | null;
  address: string | null;
}

interface Props {
  stops: DeliveryStop[];
  routes: DispatchMapRoute[];
  routeStops: Map<number, DispatchMapRouteStop[]>;
  selectedStop: DeliveryStop | null;
  onSelectStop: (stop: DeliveryStop | null) => void;
  branch: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Default center: central Iowa (between Grimes, Fort Dodge, Coralville, Birchwood)
const DEFAULT_CENTER: [number, number] = [41.9, -93.5];
const DEFAULT_ZOOM = 8;
const VEHICLE_POLL_MS = 15_000;

// Cycling color palette for routes (matches dark theme)
const ROUTE_COLORS = [
  '#06b6d4', // cyan-500 (Beisser green theme)
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#f97316', // orange-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#ef4444', // red-500
  '#84cc16', // lime-500
  '#6366f1', // indigo-500
];

// Branch dot colors match BRANCH_COLORS from TopNav
const BRANCH_VEHICLE_COLORS: Record<string, string> = {
  '20GR': '#006834', // Beisser green (Grimes)
  '10FD': '#dc2626', // red (Fort Dodge)
  '25BW': '#9e8635', // gold (Birchwood)
  '40CV': '#374151', // dark slate (Coralville)
};

const UNROUTED_COLOR = '#6b7280'; // gray-500

// ── DispatchMap ────────────────────────────────────────────────────────────────

export function DispatchMap({
  stops,
  routes,
  routeStops,
  selectedStop,
  onSelectStop,
  branch,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const stopMarkersRef = useRef<Map<string, import('leaflet').CircleMarker>>(new Map());
  const vehicleMarkersRef = useRef<Map<string, import('leaflet').Marker>>(new Map());
  const polylinesRef = useRef<import('leaflet').Polyline[]>([]);
  const vehicleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSelectStopRef = useRef(onSelectStop);
  onSelectStopRef.current = onSelectStop;

  // Build a map: so_id → route color
  const routeColorMap = useRef<Map<string, string>>(new Map());

  // ── Initialize map ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let mounted = true;

    import('leaflet').then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;

      // Fix Leaflet default icon paths broken by webpack/Next.js module resolution
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        preferCanvas: true,
      });

      // OSM street tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    });

    return () => {
      mounted = false;
      if (vehicleTimerRef.current) clearInterval(vehicleTimerRef.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      stopMarkersRef.current.clear();
      vehicleMarkersRef.current.clear();
      polylinesRef.current = [];
    };
  }, []);

  // ── Update stop markers + polylines ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Small retry for when map just mounted but isn't ready yet
    const update = () => {
      if (!mapRef.current) return;
      renderStops();
    };

    // Delay slightly on first render to ensure map tile layer is ready
    const t = setTimeout(update, 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, routes, routeStops, selectedStop]);

  const renderStops = useCallback(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current;
      if (!map) return;

      // Build route color map: so_id → color
      const colorMap = new Map<string, string>();
      routes.forEach((r, idx) => {
        const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
        const rStops = routeStops.get(r.id) ?? [];
        rStops.forEach((rs) => colorMap.set(rs.so_id, color));
      });
      routeColorMap.current = colorMap;

      // Remove old polylines
      polylinesRef.current.forEach((pl) => pl.remove());
      polylinesRef.current = [];

      // Draw route polylines
      routes.forEach((r, idx) => {
        const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
        const rStops = (routeStops.get(r.id) ?? []).slice().sort((a, b) => a.sequence - b.sequence);
        const coords: [number, number][] = rStops
          .map((rs) => {
            const s = stops.find((d) => d.so_id === rs.so_id);
            if (s?.lat != null && s?.lon != null) return [s.lat, s.lon] as [number, number];
            return null;
          })
          .filter((c): c is [number, number] => c !== null);

        if (coords.length >= 2) {
          const pl = L.polyline(coords, {
            color,
            weight: 2,
            opacity: 0.6,
            dashArray: '6 4',
          }).addTo(map);
          polylinesRef.current.push(pl);
        }
      });

      // Update/create stop markers
      const currentSoIds = new Set<string>();

      stops.forEach((stop) => {
        if (stop.lat == null || stop.lon == null) return;
        currentSoIds.add(stop.so_id);

        const isSelected = selectedStop?.so_id === stop.so_id;
        const routeColor = colorMap.get(stop.so_id) ?? UNROUTED_COLOR;
        const radius = isSelected ? 10 : 7;
        const weight = isSelected ? 3 : 1.5;

        const existing = stopMarkersRef.current.get(stop.so_id);
        if (existing) {
          existing.setLatLng([stop.lat, stop.lon]);
          existing.setStyle({
            fillColor: routeColor,
            color: isSelected ? '#fff' : routeColor,
            fillOpacity: isSelected ? 0.95 : 0.75,
            weight,
            radius,
          } as Parameters<typeof existing.setStyle>[0] & { radius: number });
          existing.setRadius(radius);
        } else {
          const marker = L.circleMarker([stop.lat, stop.lon], {
            radius,
            fillColor: routeColor,
            color: isSelected ? '#fff' : routeColor,
            fillOpacity: isSelected ? 0.95 : 0.75,
            weight,
          }).addTo(map);

          marker.bindTooltip(
            `<div style="font-size:11px;line-height:1.4">
              <strong style="color:#06b6d4">${stop.so_id}</strong><br/>
              ${stop.customer_name ?? ''}<br/>
              <span style="color:#9ca3af">${[stop.address_1, stop.city].filter(Boolean).join(', ')}</span>
            </div>`,
            { sticky: true, opacity: 0.95, className: 'dispatch-tooltip' }
          );

          marker.on('click', () => {
            onSelectStopRef.current(
              selectedStop?.so_id === stop.so_id ? null : stop
            );
          });

          stopMarkersRef.current.set(stop.so_id, marker);
        }
      });

      // Remove markers for stops no longer in list
      stopMarkersRef.current.forEach((marker, soId) => {
        if (!currentSoIds.has(soId)) {
          marker.remove();
          stopMarkersRef.current.delete(soId);
        }
      });

      // Fit bounds to stops with coords (only on first meaningful load)
      const stopsWithCoords = stops.filter((s) => s.lat != null && s.lon != null);
      if (stopsWithCoords.length > 0 && stopMarkersRef.current.size === stopsWithCoords.length) {
        const bounds = L.latLngBounds(
          stopsWithCoords.map((s) => [s.lat!, s.lon!] as [number, number])
        );
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      }
    });
  }, [stops, routes, routeStops, selectedStop]);

  // ── Vehicle overlay ──────────────────────────────────────────────────────────
  const fetchVehicles = useCallback(() => {
    import('leaflet').then((L) => {
      const map = mapRef.current;
      if (!map) return;

      const url = '/api/dispatch/vehicles' + (branch ? `?branch=${encodeURIComponent(branch)}` : '');
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { vehicles: Vehicle[] } | null) => {
          if (!data?.vehicles) return;
          const map2 = mapRef.current;
          if (!map2) return;

          const seenIds = new Set<string>();

          data.vehicles.forEach((v) => {
            if (v.latitude == null || v.longitude == null) return;
            seenIds.add(v.id);

            const branchColor = v.branch_code ? (BRANCH_VEHICLE_COLORS[v.branch_code] ?? '#6b7280') : '#6b7280';
            const heading = v.heading ?? 0;
            const icon = makeTruckIcon(L, branchColor, heading);

            const existing = vehicleMarkersRef.current.get(v.id);
            if (existing) {
              existing.setLatLng([v.latitude, v.longitude]);
              existing.setIcon(icon);
            } else {
              const marker = L.marker([v.latitude, v.longitude], { icon, zIndexOffset: 1000 }).addTo(map2);
              const lastSeen = v.time ? new Date(v.time).toLocaleTimeString() : 'unknown';
              marker.bindTooltip(
                `<div style="font-size:11px;line-height:1.5">
                  <strong>${v.name}</strong><br/>
                  ${v.address ?? ''}<br/>
                  <span style="color:#9ca3af">
                    ${v.speed != null ? Math.round(v.speed) + ' mph · ' : ''}${lastSeen}
                  </span>
                </div>`,
                { sticky: true, opacity: 0.95, className: 'dispatch-tooltip' }
              );
              vehicleMarkersRef.current.set(v.id, marker);
            }
          });

          // Remove vehicles no longer in response
          vehicleMarkersRef.current.forEach((marker, id) => {
            if (!seenIds.has(id)) {
              marker.remove();
              vehicleMarkersRef.current.delete(id);
            }
          });
        })
        .catch(() => {});
    });
  }, [branch]);

  useEffect(() => {
    // Initial fetch after map is ready
    const t = setTimeout(fetchVehicles, 500);
    vehicleTimerRef.current = setInterval(fetchVehicles, VEHICLE_POLL_MS);
    return () => {
      clearTimeout(t);
      if (vehicleTimerRef.current) clearInterval(vehicleTimerRef.current);
    };
  }, [fetchVehicles]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />

      {/* Legend overlay */}
      <div className="absolute bottom-6 left-2 z-[400] bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-2 text-[10px] space-y-1 pointer-events-none">
        {routes.slice(0, 8).map((r, idx) => (
          <div key={r.id} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-0.5 shrink-0"
              style={{ backgroundColor: ROUTE_COLORS[idx % ROUTE_COLORS.length] }}
            />
            <span className="text-gray-300 truncate max-w-[120px]">{r.route_name}</span>
          </div>
        ))}
        {routes.length === 0 && (
          <div className="text-gray-500">No routes planned</div>
        )}
        <div className="border-t border-gray-700 pt-1 mt-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#06b6d4' }} />
            <span className="text-gray-400">Stop (mapped)</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-block text-[8px]">🚚</span>
            <span className="text-gray-400">Live vehicle</span>
          </div>
        </div>
      </div>

      {/* No-coords notice */}
      {stops.length > 0 && stops.every((s) => s.lat == null) && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[400] bg-yellow-900/80 border border-yellow-700 rounded px-3 py-1.5 text-xs text-yellow-300 pointer-events-none">
          No coordinates found for today&apos;s stops — check agility_customers lat/lon data
        </div>
      )}

      <style>{`
        .dispatch-tooltip {
          background: #111827;
          border: 1px solid #374151;
          border-radius: 6px;
          padding: 6px 8px;
          color: #e5e7eb;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .dispatch-tooltip::before { display: none; }
        .leaflet-tooltip.dispatch-tooltip { white-space: nowrap; }
      `}</style>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeTruckIcon(L: typeof import('leaflet'), color: string, heading: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <g transform="rotate(${heading}, 14, 14)">
      <polygon points="14,3 22,22 14,18 6,22" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.95"/>
    </g>
    <circle cx="14" cy="14" r="3" fill="#fff" opacity="0.8"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

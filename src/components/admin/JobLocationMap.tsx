'use client';

import { useEffect, useRef } from 'react';

interface Props {
  lat: number;
  lon: number;
  label: string;
  address: string;
}

const DEFAULT_ZOOM = 14;

export function JobLocationMap({ lat, lon, label, address }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let mounted = true;

    import('leaflet').then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;

      // Fix Leaflet default icon paths broken by webpack/Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!, {
        center: [lat, lon],
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        preferCanvas: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.circleMarker([lat, lon], {
        radius: 10,
        fillColor: '#06b6d4',
        color: '#fff',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);

      marker.bindTooltip(
        `<div style="font-size:11px;line-height:1.5">
          <strong style="color:#06b6d4">${label}</strong><br/>
          <span style="color:#9ca3af">${address}</span>
        </div>`,
        { permanent: true, direction: 'top', offset: [0, -12], className: 'job-map-tooltip' }
      ).openTooltip();

      mapRef.current = map;
    });

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // Only run once on mount — lat/lon are stable for a given detail page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />
      <style>{`
        .job-map-tooltip {
          background: #111827;
          border: 1px solid #374151;
          border-radius: 6px;
          padding: 5px 8px;
          color: #e5e7eb;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          white-space: nowrap;
        }
        .job-map-tooltip::before { display: none; }
      `}</style>
    </div>
  );
}

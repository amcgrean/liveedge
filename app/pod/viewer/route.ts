/**
 * GET /pod/viewer?Branch=20GR&RefNum=0001472105&Type=SO&GUID=...
 *
 * Public route handler — no auth required.
 * Agility desktop opens this URL when staff click "View Images" on an SO.
 *
 * Configure in Agility: System Configuration → Misc Settings → Images URL:
 *   https://your-domain.com/pod/viewer?
 *
 * (trailing ? required — Agility appends &Branch=...&RefNum=...&Type=...&GUID=...)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../db/index';
import { getPresignedUrl } from '../../../src/lib/r2';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type PhotoRow = {
  id: number; r2_key: string; filename: string; content_type: string;
  category: string; driver_name: string | null; taken_at: string;
  shipment_num: number; notes: string | null;
};

const categoryLabel: Record<string, string> = {
  delivery: 'Delivery Photos',
  load:     'Load / Truck Photos',
  pick:     'Pick Verification',
  refusal:  'Refusal Documentation',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPhotoGrid(catPhotos: (PhotoRow & { url: string })[]): string {
  return `<div class="photo-grid">
    ${catPhotos.map((p) => `
      <div class="photo-card">
        <img src="${esc(p.url)}" alt="${esc(p.filename)}" loading="lazy" onclick="openLb(this.src)" />
        <div class="photo-meta">
          <span class="driver">${esc(p.driver_name ?? 'Driver')}</span>
          <span class="time">${fmtDate(p.taken_at)}</span>
        </div>
        ${p.notes ? `<div class="photo-notes">${esc(p.notes)}</div>` : ''}
      </div>
    `).join('')}
  </div>`;
}

function renderSections(photos: (PhotoRow & { url: string })[], multiShipment: boolean): string {
  if (!multiShipment) {
    // Single shipment — group by category only
    const byCategory: Record<string, typeof photos> = {};
    for (const p of photos) (byCategory[p.category] ??= []).push(p);
    return Object.entries(byCategory).map(([cat, catPhotos]) => `
      <div class="section-title">${esc(categoryLabel[cat] ?? cat)} (${catPhotos.length})</div>
      ${renderPhotoGrid(catPhotos)}
    `).join('');
  }

  // Multiple shipments — group by shipment first, then by category
  const byShipment: Record<number, typeof photos> = {};
  for (const p of photos) (byShipment[p.shipment_num] ??= []).push(p);

  return Object.entries(byShipment)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([shipNum, shipPhotos]) => {
      const byCategory: Record<string, typeof shipPhotos> = {};
      for (const p of shipPhotos) (byCategory[p.category] ??= []).push(p);
      return `
        <div class="shipment-header">Shipment #${esc(shipNum)} &mdash; ${shipPhotos.length} photo${shipPhotos.length !== 1 ? 's' : ''}</div>
        ${Object.entries(byCategory).map(([cat, catPhotos]) => `
          <div class="section-title">${esc(categoryLabel[cat] ?? cat)} (${catPhotos.length})</div>
          ${renderPhotoGrid(catPhotos)}
        `).join('')}
      `;
    }).join('');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const branch = searchParams.get('Branch') ?? searchParams.get('branch') ?? '';
  const refNum = searchParams.get('RefNum') ?? searchParams.get('refNum') ?? searchParams.get('so') ?? '';
  const type   = searchParams.get('Type')   ?? searchParams.get('type')   ?? 'SO';

  const hasParams = !!(branch && refNum);

  let photos: (PhotoRow & { url: string })[] = [];
  let loadError = '';

  if (hasParams) {
    try {
      const db = getDb();
      const result = await db.execute(sql`
        SELECT id, r2_key, filename, content_type, category,
               driver_name, taken_at, shipment_num, notes
        FROM   bids.pod_photos
        WHERE  so_id = ${refNum} AND branch_code = ${branch}
        ORDER  BY taken_at ASC
      `);
      photos = await Promise.all(
        (result as unknown as PhotoRow[]).map(async (p) => ({
          ...p,
          url: await getPresignedUrl(p.r2_key, 3600),
        }))
      );
    } catch (err) {
      console.error('[pod viewer]', err);
      loadError = 'Could not load photos. Please try again.';
    }
  }

  const shipmentNums = new Set(photos.map((p) => p.shipment_num));
  const multiShipment = shipmentNums.size > 1;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${hasParams ? `POD \u2014 ${esc(type)} ${esc(refNum)} (${esc(branch)})` : 'POD Image Viewer'}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 20px; min-height: 100vh;
    }
    .header { border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 1.25rem; font-weight: 700; color: #67e8f9; }
    .meta-grid { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 10px; font-size: 0.75rem; }
    .meta-item { color: #94a3b8; }
    .meta-item strong { color: #cbd5e1; }
    .shipment-header {
      font-size: 1rem; font-weight: 700; color: #67e8f9;
      border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin: 32px 0 4px;
    }
    .shipment-header:first-child { margin-top: 0; }
    .section-title {
      font-size: 0.8125rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; color: #475569; margin: 20px 0 12px;
    }
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .photo-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; overflow: hidden; }
    .photo-card img { width: 100%; display: block; cursor: zoom-in; transition: opacity 0.15s; }
    .photo-card img:hover { opacity: 0.88; }
    .photo-meta {
      padding: 10px 12px; font-size: 0.6875rem; color: #64748b;
      border-top: 1px solid #334155; display: flex; justify-content: space-between; gap: 8px;
    }
    .photo-meta .driver { color: #94a3b8; font-weight: 500; }
    .photo-meta .time   { text-align: right; white-space: nowrap; }
    .photo-notes { padding: 0 12px 10px; font-size: 0.6875rem; color: #94a3b8; font-style: italic; }
    .empty { text-align: center; padding: 60px 20px; }
    .empty .icon { font-size: 2.5rem; margin-bottom: 12px; }
    .empty strong { color: #64748b; font-size: 0.9375rem; }
    .empty p { font-size: 0.8125rem; color: #475569; margin-top: 6px; }
    .error-box {
      background: #450a0a; border: 1px solid #7f1d1d;
      border-radius: 8px; padding: 16px; color: #fca5a5; font-size: 0.875rem;
    }
    #lb {
      display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92);
      z-index: 999; align-items: center; justify-content: center; cursor: zoom-out;
    }
    #lb.open { display: flex; }
    #lb img { max-width: 96vw; max-height: 96vh; object-fit: contain; border-radius: 4px; }
    #lb-close {
      position: fixed; top: 14px; right: 18px; color: #fff;
      font-size: 1.75rem; cursor: pointer; opacity: 0.7;
      background: none; border: none; padding: 4px; line-height: 1;
    }
    #lb-close:hover { opacity: 1; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Proof of Delivery &mdash; ${esc(type)} ${esc(refNum) || '&mdash;'}</h1>
    <div class="meta-grid">
      ${branch ? `<span class="meta-item"><strong>Branch:</strong> ${esc(branch)}</span>` : ''}
      ${refNum ? `<span class="meta-item"><strong>Ref #:</strong> ${esc(refNum)}</span>` : ''}
      ${type   ? `<span class="meta-item"><strong>Type:</strong> ${esc(type)}</span>` : ''}
      <span class="meta-item"><strong>Photos:</strong> ${photos.length}</span>
    </div>
  </div>

  ${loadError ? `<div class="error-box">${esc(loadError)}</div>` : ''}

  ${!hasParams && !loadError ? `
    <div class="empty">
      <div class="icon">&#128230;</div>
      <strong>No sales order specified.</strong>
      <p>Branch and RefNum parameters are required.</p>
    </div>
  ` : ''}

  ${hasParams && !loadError && photos.length === 0 ? `
    <div class="empty">
      <div class="icon">&#128247;</div>
      <strong>No delivery photos on file for ${esc(type)} ${esc(refNum)}.</strong>
      <p>Photos captured via the LiveEdge driver app will appear here.</p>
    </div>
  ` : ''}

  ${renderSections(photos, multiShipment)}

  <div id="lb" onclick="if(event.target===this)closeLb()">
    <button id="lb-close" onclick="closeLb()">&#x2715;</button>
    <img id="lb-img" src="" alt="enlarged" />
  </div>

  <script>
    function openLb(src) {
      document.getElementById('lb-img').src = src;
      document.getElementById('lb').classList.add('open');
    }
    function closeLb() {
      document.getElementById('lb').classList.remove('open');
      document.getElementById('lb-img').src = '';
    }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLb();
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

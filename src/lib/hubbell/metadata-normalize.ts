// Normalizers for the metadata payload shape that the Pi scraper POSTs to
// /api/admin/hubbell/upload and /api/admin/hubbell/documents/metadata-bulk.
//
// Canonical line_items shape consumed by LiveEdge UI:
//   { sku, desc, qty, uom, unit_price, ext }
// Older Pi versions emit description/unit/ext_price/etc — we accept those
// aliases here so the UI sees a uniform shape regardless of scraper version.

export type CanonicalLineItem = {
  sku?: string;
  desc?: string;
  qty?: number;
  uom?: string;
  unit_price?: number;
  ext?: number;
};

function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strOrUndef(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

export function normalizeLineItems(raw: unknown): CanonicalLineItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CanonicalLineItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    out.push({
      sku:        strOrUndef(o.sku ?? o.product_code ?? o.code),
      desc:       strOrUndef(o.desc ?? o.description),
      qty:        numOrUndef(o.qty ?? o.quantity),
      uom:        strOrUndef(o.uom ?? o.unit ?? o.u_m),
      unit_price: numOrUndef(o.unit_price ?? o.price),
      ext:        numOrUndef(o.ext ?? o.ext_price ?? o.extension ?? o.amount),
    });
  }
  return out;
}

export function parseNumberToString(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

// Returns a YYYY-MM-DD string (the format Drizzle's `date` column expects)
// or null. Accepts any string Date() can parse — ISO timestamps, MM/DD/YYYY,
// MM-DD-YYYY, etc.
export function parseDateOrNull(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return null;
  // Use UTC to avoid the date shifting one day due to local TZ offset.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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

export function parseDateOrNull(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

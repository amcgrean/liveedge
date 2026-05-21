// Opaque cursor helpers for Phase 3d read endpoints.
//
// Cursor encodes (date_iso, uuid) so pagination is stable across same-date
// rows. Base64 wrapping is purely for opacity — clients should treat the
// cursor as a string and not parse it.

export type Cursor = {
  d: string;  // ISO timestamp (date-only or full timestamp depending on endpoint)
  id: string; // UUID of the last row
};

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(s: string): Cursor | null {
  try {
    const json = Buffer.from(s, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.d === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return { d: parsed.d, id: parsed.id };
    }
  } catch {
    // fall through
  }
  return null;
}

export function clampLimit(raw: unknown, fallback = 200, max = 1000): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

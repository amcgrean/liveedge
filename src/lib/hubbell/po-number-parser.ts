// Parse the Agility customer-PO field (agility_so_header.po_number).
// The team types Hubbell PO/WO numbers into this field by hand, often
// comma-separated when a single Hubbell document covers multiple SOs.
//
// Splits on commas, semicolons, slashes, pipes, and whitespace runs.
// Trims, uppercases, drops empties and obvious noise tokens.

const NOISE = new Set(['', 'AND', '&', '/', '-', 'N/A', 'NA', 'NONE']);

export function parsePoNumberField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const tokens = raw
    .split(/[,;|/\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0 && !NOISE.has(t));
  // Dedupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// Normalize a single document number for comparison.
// Strip leading zeros only when the rest is numeric (so "0012345" → "12345"
// but "PO-2024-001" stays as "PO-2024-001"). Always uppercase + trim.
export function normalizeDocNumber(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (/^0+\d+$/.test(upper)) return upper.replace(/^0+/, '');
  return upper;
}

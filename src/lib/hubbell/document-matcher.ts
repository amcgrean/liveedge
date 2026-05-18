// Match a Hubbell PO/WO document to one or more open Agility sales orders.
//
// Two-signal strategy:
//   A (strong): agility_so_header.po_number contains the Hubbell doc number
//              after splitting on commas/spaces/semicolons. Confidence = 100.
//   B (weak):  address fuzzy score against shipto_address_1/city/state/zip.
//              Confidence 0–100 from the same scorer the email pipeline used.
//
// If Signal A produces any matches, the matcher returns ONLY those (the buyer
// typed the number in by hand — that's authoritative). Address candidates are
// returned for reviewer-driven attach when Signal A is empty.

import { getErpSql } from '../../../db/supabase';
import { parsePoNumberField, normalizeDocNumber } from './po-number-parser';

export interface MatchResult {
  soId: number;
  systemId: string | null;
  custCode: string | null;
  custName: string | null;
  reference: string | null;
  poNumber: string | null;
  shiptoAddress: string | null;
  shiptoCity: string | null;
  shiptoState: string | null;
  shiptoZip: string | null;
  soStatus: string | null;
  matchSource: 'po_number_split' | 'address';
  confidence: number;        // 0–100
  matchReasons: string[];
}

type SoRow = {
  so_id: number;
  system_id: string | null;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  so_status: string | null;
};

export interface ExtractedAddress {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

// ───────────────────────── address scoring helpers ──────────────────────────
function tokenSet(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function streetNumber(s: string): string | null {
  const m = s.trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

function expandMultiUnitAddress(addr: string): string[] {
  const m = addr.match(/^(\d+),\s*(\d+)\s+(.+)$/);
  if (m) return [`${m[1]} ${m[3]}`, `${m[2]} ${m[3]}`];
  return [addr];
}

function scoreAddress(candidate: SoRow, extracted: ExtractedAddress): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const { address, city, state, zip } = extracted;

  if (zip && candidate.shipto_zip) {
    const candZip = candidate.shipto_zip.trim().slice(0, 5);
    if (candZip === zip.slice(0, 5)) {
      score += 35;
      reasons.push('zip');
    }
  }
  if (city && candidate.shipto_city) {
    const simCity = jaccardSim(tokenSet(city), tokenSet(candidate.shipto_city));
    if (simCity >= 0.8) { score += 20; reasons.push('city'); }
    else if (simCity >= 0.5) { score += 10; reasons.push('city~'); }
  }
  if (state && candidate.shipto_state) {
    if (candidate.shipto_state.trim().toUpperCase() === state.toUpperCase()) {
      score += 5;
      reasons.push('state');
    }
  }
  if (address && candidate.shipto_address_1) {
    const candVariants = expandMultiUnitAddress(candidate.shipto_address_1.trim());
    const extractedNum = streetNumber(address);
    const candNums = new Set(candVariants.map((v) => streetNumber(v)).filter(Boolean) as string[]);
    if (extractedNum && candNums.has(extractedNum)) {
      score += 15;
      reasons.push('street_num');
    }
    const emailTokens = tokenSet(address);
    const simAddr = Math.max(...candVariants.map((v) => jaccardSim(emailTokens, tokenSet(v))));
    if (simAddr >= 0.7) { score += 25; reasons.push('street'); }
    else if (simAddr >= 0.4) { score += Math.round(simAddr * 25); reasons.push('street~'); }
  }

  return { score: Math.min(score, 100), reasons };
}

// ───────────────────────── main matcher ─────────────────────────────────────
export async function matchDocumentToSos(params: {
  docNumber: string;
  address?: ExtractedAddress;
}): Promise<MatchResult[]> {
  const docNumberNormalized = normalizeDocNumber(params.docNumber);
  const sql = getErpSql();

  // ---- Signal A: po_number contains doc_number after splitting ----
  // Pull all open SOs whose po_number is non-empty. Filter in JS to allow
  // the project's normalizeDocNumber rules (leading-zero strip etc.) without
  // a SQL-side parser. The set is bounded (~few thousand open SOs with a PO
  // typed in at any time), so the round-trip is fine.
  const poMatchRows = await sql<SoRow[]>`
    SELECT
      soh.so_id::int                AS so_id,
      soh.system_id,
      TRIM(soh.cust_code)           AS cust_code,
      soh.cust_name,
      soh.reference,
      soh.po_number,
      soh.shipto_address_1,
      soh.shipto_city,
      soh.shipto_state,
      soh.shipto_zip,
      soh.so_status
    FROM agility_so_header soh
    WHERE soh.is_deleted = false
      AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
      AND soh.po_number IS NOT NULL
      AND TRIM(soh.po_number) <> ''
  `;

  const exactHits: MatchResult[] = [];
  for (const row of poMatchRows) {
    const tokens = parsePoNumberField(row.po_number).map(normalizeDocNumber);
    if (tokens.includes(docNumberNormalized)) {
      exactHits.push({
        soId: row.so_id,
        systemId: row.system_id,
        custCode: row.cust_code?.trim() || null,
        custName: row.cust_name?.trim() || null,
        reference: row.reference?.trim() || null,
        poNumber: row.po_number?.trim() || null,
        shiptoAddress: row.shipto_address_1?.trim() || null,
        shiptoCity: row.shipto_city?.trim() || null,
        shiptoState: row.shipto_state?.trim() || null,
        shiptoZip: row.shipto_zip?.trim() || null,
        soStatus: row.so_status?.trim() || null,
        matchSource: 'po_number_split',
        confidence: 100,
        matchReasons: ['po_number_split'],
      });
    }
  }

  if (exactHits.length > 0) return exactHits;

  // ---- Signal B: address fuzzy match ----
  const addr = params.address;
  if (!addr || (!addr.zip && !addr.city && !addr.address)) return [];

  const zipClause = addr.zip
    ? sql`OR TRIM(soh.shipto_zip) LIKE ${addr.zip.slice(0, 5) + '%'}`
    : sql``;
  const cityClause = addr.city
    ? sql`OR LOWER(TRIM(soh.shipto_city)) ILIKE ${'%' + addr.city.toLowerCase() + '%'}`
    : sql``;
  const addrPrefix = addr.address?.match(/^(\d+)/)?.[1] ?? addr.address?.toLowerCase().slice(0, 8);
  const addrClause = addrPrefix
    ? sql`OR LOWER(soh.shipto_address_1) ILIKE ${addrPrefix + '%'}`
    : sql``;

  const candidates = await sql<SoRow[]>`
    SELECT
      soh.so_id::int          AS so_id,
      soh.system_id,
      TRIM(soh.cust_code)     AS cust_code,
      soh.cust_name,
      soh.reference,
      soh.po_number,
      soh.shipto_address_1,
      soh.shipto_city,
      soh.shipto_state,
      soh.shipto_zip,
      soh.so_status
    FROM agility_so_header soh
    WHERE soh.is_deleted = false
      AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
      AND (FALSE ${zipClause} ${cityClause} ${addrClause})
    LIMIT 200
  `;

  type Scored = { row: SoRow; score: number; reasons: string[] };
  const scored: Scored[] = candidates
    .map((row) => ({ row, ...scoreAddress(row, addr) }))
    .filter((s) => s.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return scored.map(({ row, score, reasons }) => ({
    soId: row.so_id,
    systemId: row.system_id,
    custCode: row.cust_code?.trim() || null,
    custName: row.cust_name?.trim() || null,
    reference: row.reference?.trim() || null,
    poNumber: row.po_number?.trim() || null,
    shiptoAddress: row.shipto_address_1?.trim() || null,
    shiptoCity: row.shipto_city?.trim() || null,
    shiptoState: row.shipto_state?.trim() || null,
    shiptoZip: row.shipto_zip?.trim() || null,
    soStatus: row.so_status?.trim() || null,
    matchSource: 'address' as const,
    confidence: score,
    matchReasons: reasons,
  }));
}

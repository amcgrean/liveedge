// Matches extracted email address data against agility_so_header ship-to addresses.
// Returns up to 10 scored candidates, sorted by confidence descending.

import { getErpSql } from '../../../db/supabase';

export interface MatchCandidate {
  soId: string;
  systemId: string;
  custCode: string | null;
  custName: string | null;
  reference: string | null;
  shiptoAddress: string | null;
  shiptoCity: string | null;
  shiptoState: string | null;
  shiptoZip: string | null;
  confidence: number;   // 0–100
  matchReasons: string[];
  rank: number;
}

type SoRow = {
  so_id: string;
  system_id: string;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
};

// Tokenize a string to lowercase word set
function tokenSet(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

// Jaccard similarity of two token sets
function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

// Extract leading street number from an address string
function streetNumber(s: string): string | null {
  const m = s.trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

function scoreCandidate(
  candidate: SoRow,
  extracted: { address: string | null; city: string | null; state: string | null; zip: string | null }
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const { address, city, state, zip } = extracted;

  // --- ZIP (35 pts) ---
  if (zip && candidate.shipto_zip) {
    const candZip = candidate.shipto_zip.trim().slice(0, 5);
    if (candZip === zip.slice(0, 5)) {
      score += 35;
      reasons.push('zip');
    }
  }

  // --- CITY (20 pts) ---
  if (city && candidate.shipto_city) {
    const simCity = jaccardSim(tokenSet(city), tokenSet(candidate.shipto_city));
    if (simCity >= 0.8) {
      score += 20;
      reasons.push('city');
    } else if (simCity >= 0.5) {
      score += 10;
      reasons.push('city~');
    }
  }

  // --- STATE (5 pts) ---
  if (state && candidate.shipto_state) {
    if (candidate.shipto_state.trim().toUpperCase() === state.toUpperCase()) {
      score += 5;
      reasons.push('state');
    }
  }

  // --- STREET ADDRESS (40 pts) ---
  if (address && candidate.shipto_address_1) {
    const candAddr = candidate.shipto_address_1.trim();

    // Street number exact match (15 pts)
    const extractedNum = streetNumber(address);
    const candNum = streetNumber(candAddr);
    if (extractedNum && candNum && extractedNum === candNum) {
      score += 15;
      reasons.push('street_num');
    }

    // Street name token similarity (25 pts)
    const simAddr = jaccardSim(tokenSet(address), tokenSet(candAddr));
    if (simAddr >= 0.7) {
      score += 25;
      reasons.push('street');
    } else if (simAddr >= 0.4) {
      score += Math.round(simAddr * 25);
      reasons.push('street~');
    }
  }

  // Cap at 100
  return { score: Math.min(score, 100), reasons };
}

export async function matchAddress(params: {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): Promise<MatchCandidate[]> {
  const { address, city, state, zip } = params;

  // Need at least one signal to query
  if (!zip && !city && !address) return [];

  const sql = getErpSql();

  // Build a union of candidates: zip match OR city match OR address prefix match
  const zipClause  = zip    ? sql`OR TRIM(soh.shipto_zip) LIKE ${zip.slice(0, 5) + '%'}` : sql``;
  const cityClause = city   ? sql`OR LOWER(TRIM(soh.shipto_city)) ILIKE ${'%' + city.toLowerCase() + '%'}` : sql``;
  const addrClause = address
    ? sql`OR LOWER(soh.shipto_address_1) ILIKE ${address.toLowerCase().slice(0, 8) + '%'}`
    : sql``;

  const rows = await sql<SoRow[]>`
    SELECT
      soh.so_id::text         AS so_id,
      soh.system_id,
      TRIM(soh.cust_code)     AS cust_code,
      soh.cust_name,
      soh.reference,
      soh.shipto_address_1,
      soh.shipto_city,
      soh.shipto_state,
      soh.shipto_zip
    FROM agility_so_header soh
    WHERE soh.is_deleted = false
      AND (
        FALSE
        ${zipClause}
        ${cityClause}
        ${addrClause}
      )
    LIMIT 200
  `;

  if (rows.length === 0) return [];

  // Score and sort
  type Scored = { row: SoRow; score: number; reasons: string[] };

  const scored: Scored[] = rows
    .map((row) => {
      const { score, reasons } = scoreCandidate(row, { address, city, state, zip });
      return { row, score, reasons };
    })
    .filter((s: Scored) => s.score >= 20)
    .sort((a: Scored, b: Scored) => b.score - a.score)
    .slice(0, 10);

  return scored.map(({ row, score, reasons }: Scored, i) => ({
    soId:          row.so_id,
    systemId:      row.system_id,
    custCode:      row.cust_code?.trim() || null,
    custName:      row.cust_name?.trim() || null,
    reference:     row.reference?.trim() || null,
    shiptoAddress: row.shipto_address_1?.trim() || null,
    shiptoCity:    row.shipto_city?.trim()    || null,
    shiptoState:   row.shipto_state?.trim()   || null,
    shiptoZip:     row.shipto_zip?.trim()     || null,
    confidence: score,
    matchReasons: reasons,
    rank: i + 1,
  }));
}

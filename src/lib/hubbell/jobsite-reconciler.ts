// Within-jobsite reconciliation for the Hubbell document backlog.
//
// Why this exists separately from document-matcher.ts:
//   document-matcher.ts filters agility_so_header to `so_status NOT IN
//   ('I','C','X')`. For ~6,800 historical Hubbell docs the matching SO is
//   long since invoiced — the existing matcher excludes the right answer by
//   construction. Address-fuzzy fallback can't recover them because Hubbell
//   SOs leave shipto_address_1 blank on the header (99.8% of rows); the
//   physical address lives in agility_customers and is reached via
//   (cust_key, shipto_seq_num=seq_num).
//
// Strategy: outer loop is jobsite (one normalized resolved address). Inner
// data is ALL unmatched docs at that jobsite + ALL HUBB SOs at that jobsite
// across every status. Within that small set we run:
//
//   Signal A  (auto-attach @ confidence 100): po_number_split — buyer typed
//             the doc number into agility_so_header.po_number. Authoritative.
//   Signal S  (+30 each keyword, cap 80): scope keyword overlap between doc
//             line-item descriptions and SO.reference. Hubbell reference is a
//             short scope tag ("framing", "trim load 1497", "doors").
//   Signal T  (+15): total amount within 10% of SUM(extended_price).
//   Signal D  (+10): doc need-by within 90d of SO created_date.
//
// All matches except Signal A go to hubbell_document_suggestions for human
// review through the existing CLI / admin queue.

import { getErpSql } from '../../../db/supabase';
import { parsePoNumberField, normalizeDocNumber } from './po-number-parser';

const HUBBELL_CUST_PREFIX = 'HUBB%';
const SIGNAL_A_CONFIDENCE = 100;
const SIGNAL_S_PER_KEYWORD = 30;
const SIGNAL_S_PER_BROAD_KEYWORD = 15;
const SIGNAL_S_CAP = 80;
const SIGNAL_T_BONUS = 15;
const SIGNAL_D_BONUS = 10;
const TOTAL_TOLERANCE_PCT = 0.10;
const DATE_TOLERANCE_DAYS = 90;
// SOs whose reference is a partial backout, replacement, VPO, or add-on
// almost always rejected on scope-only matches in the first Codex review
// batch (`Trim Credit`, `Deck Credit`, `framing credit`, `REplacement Trim
// VPO`, `added trim`). Suppress these unless the doc's total also matches
// (i.e. the document really is for the small partial-scope amount).
const NEGATIVE_REF_PENALTY = 30;
const NEGATIVE_REF_PATTERN = /\b(credit|cred|replacement|repl|vpo|added)\b/i;

const SCOPE_KEYWORDS = [
  'door',
  'window',
  'frame',
  'framing',
  'trim',
  'hardware',
  'lock',
  'shingle',
  'lumber',
  'truss',
  'siding',
  'paint',
  'deck',
  'cabinet',
  'molding',
  'screen',
  'beam',
  'joist',
  'rafter',
  'subfloor',
  'sheathing',
] as const;

// "Broad" keywords appear in lots of unrelated docs and the SO reference
// uses them generically — Codex's first review pass flagged `frame/framing`
// as a frequent scope-only false positive. Demote these to half weight; they
// only count at full weight when paired with another keyword or another
// signal.
const BROAD_SCOPE_KEYWORDS = new Set<string>(['frame', 'lumber']);

// Stem any scope keyword to its singular root for comparison
//   "doors" → "door", "windows" → "window", "framing" → "frame"
function stemScope(word: string): string {
  const w = word.toLowerCase();
  for (const root of SCOPE_KEYWORDS) {
    if (w === root) return root;
    if (w === root + 's') return root;
    if (root === 'frame' && (w === 'framing' || w === 'frames')) return 'frame';
  }
  return w;
}

function extractScopeTokens(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .map(stemScope);
  return new Set(tokens.filter((t): t is string => SCOPE_KEYWORDS.includes(t as never)));
}

function scopeOverlap(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const t of a) if (b.has(t)) out.push(t);
  return out;
}

function withinPercent(a: number, b: number, tolerance: number): boolean {
  if (a === 0 && b === 0) return true;
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return false;
  return Math.abs(a - b) / base <= tolerance;
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / 86_400_000;
}

export interface JobsitePairing {
  document_id: string;
  so_id: number;
  cust_code: string | null;
  confidence: number;
  match_source: 'jobsite_reconcile';
  match_reasons: string[];
}

interface DocRow {
  id: string;
  doc_number: string | null;
  extracted_address: string | null;
  extracted_total: string | null;
  extracted_need_by: string | null;
  line_items: unknown;
}

interface SoRow {
  so_id: number;
  cust_code: string | null;
  so_status: string | null;
  created_date: string | null;
  reference: string | null;
  po_number: string | null;
  order_total: string | null;
}

interface LineItem {
  desc?: string;
  description?: string;
}

function descriptionsFromLineItems(li: unknown): string {
  if (!Array.isArray(li)) return '';
  return (li as LineItem[])
    .map((row) => row?.desc ?? row?.description ?? '')
    .filter((s) => typeof s === 'string')
    .join(' ');
}

// Find all unmatched Hubbell documents at the given normalized jobsite, plus
// all HUBB SOs (any status) at that jobsite via agility_customers resolution.
// Used by the per-jobsite reconciler and by the queue-listing endpoint.
export async function fetchJobsiteData(normAddr: string): Promise<{ docs: DocRow[]; sos: SoRow[] }> {
  const sql = getErpSql();

  const docs = await sql<DocRow[]>`
    SELECT
      d.id,
      d.doc_number,
      d.extracted_address,
      d.extracted_total::text   AS extracted_total,
      d.extracted_need_by::text AS extracted_need_by,
      d.line_items
    FROM bids.hubbell_documents d
    WHERE bids.hubbell_normalize_address(d.extracted_address) = ${normAddr}
      AND NOT EXISTS (
        SELECT 1 FROM bids.hubbell_document_sos s WHERE s.document_id = d.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM bids.hubbell_document_suggestions sg
        WHERE sg.document_id = d.id AND sg.status IN ('pending','accepted')
      )
  `;

  // SOs at this jobsite, any status, HUBB scope. Address resolved via
  // agility_customers — agility_so_header.shipto_address_1 is blank on
  // 99.8% of HUBB SOs. Customer addresses are expanded for duplex/multi-unit
  // ("9740, 9748 Regatta Lane" → "9740 Regatta Lane" + "9748 Regatta Lane")
  // via bids.hubbell_expand_multi_unit.
  const sos = await sql<SoRow[]>`
    WITH matching_shiptos AS (
      SELECT DISTINCT c.cust_key, c.seq_num
      FROM agility_customers c,
           LATERAL bids.hubbell_expand_multi_unit(c.address_1) AS variant
      WHERE c.cust_code LIKE ${HUBBELL_CUST_PREFIX}
        AND c.is_deleted = false
        AND bids.hubbell_normalize_address(variant) = ${normAddr}
    )
    SELECT
      soh.so_id::int           AS so_id,
      TRIM(soh.cust_code)      AS cust_code,
      soh.so_status,
      soh.created_date::text   AS created_date,
      soh.reference,
      soh.po_number,
      ot.order_total::text     AS order_total
    FROM agility_so_header soh
    JOIN matching_shiptos ms
      ON ms.cust_key = soh.cust_key
     AND ms.seq_num  = soh.shipto_seq_num
    LEFT JOIN LATERAL (
      SELECT SUM(extended_price) AS order_total
      FROM agility_so_lines
      WHERE so_id = soh.so_id
        AND system_id = soh.system_id
        AND is_deleted = false
    ) ot ON true
    WHERE soh.is_deleted = false
      AND soh.cust_code LIKE ${HUBBELL_CUST_PREFIX}
    ORDER BY soh.created_date DESC NULLS LAST
  `;

  return { docs, sos };
}

// Pair docs with SOs inside a single jobsite. Returns one pairing per
// (doc, SO) where confidence ≥ minConfidence.
export function pairDocsToSos(
  docs: DocRow[],
  sos: SoRow[],
  minConfidence = 30,
): JobsitePairing[] {
  const pairings: JobsitePairing[] = [];

  for (const doc of docs) {
    const docNum = doc.doc_number ? normalizeDocNumber(doc.doc_number) : null;
    const docScope = extractScopeTokens(descriptionsFromLineItems(doc.line_items));
    const docTotal = doc.extracted_total ? Number(doc.extracted_total) : null;

    for (const so of sos) {
      const reasons: string[] = [];
      let confidence = 0;

      // Signal A — po_number_split
      if (docNum && so.po_number) {
        const tokens = parsePoNumberField(so.po_number).map(normalizeDocNumber);
        if (tokens.includes(docNum)) {
          reasons.push('po_number_split');
          confidence = SIGNAL_A_CONFIDENCE;
        }
      }

      // Signals S/T/D only fire when A didn't (A is authoritative)
      if (confidence < SIGNAL_A_CONFIDENCE) {
        // Signal S — scope keyword overlap on SO.reference.
        // Broad keywords (frame/lumber) score at half weight unless they
        // appear alongside at least one non-broad keyword in the overlap.
        const refScope = extractScopeTokens(so.reference);
        const overlap = scopeOverlap(docScope, refScope);
        const hasSpecificOverlap = overlap.some((k) => !BROAD_SCOPE_KEYWORDS.has(k));
        if (overlap.length > 0) {
          let scopeBoost = 0;
          for (const k of overlap) {
            scopeBoost += BROAD_SCOPE_KEYWORDS.has(k) && !hasSpecificOverlap
              ? SIGNAL_S_PER_BROAD_KEYWORD
              : SIGNAL_S_PER_KEYWORD;
          }
          scopeBoost = Math.min(scopeBoost, SIGNAL_S_CAP);
          confidence += scopeBoost;
          reasons.push(`scope:${overlap.join('+')}`);
        }

        // Signal T — amount proximity
        let totalMatched = false;
        if (docTotal !== null && so.order_total !== null) {
          const soTotal = Number(so.order_total);
          if (Number.isFinite(soTotal) && withinPercent(docTotal, soTotal, TOTAL_TOLERANCE_PCT)) {
            confidence += SIGNAL_T_BONUS;
            reasons.push('total~10%');
            totalMatched = true;
          }
        }

        // Signal D — date proximity
        if (doc.extracted_need_by && so.created_date) {
          const d = daysBetween(doc.extracted_need_by, so.created_date);
          if (d <= DATE_TOLERANCE_DAYS) {
            confidence += SIGNAL_D_BONUS;
            reasons.push(`date<=${DATE_TOLERANCE_DAYS}d`);
          }
        }

        // Negative reference penalty — refs like "Trim Credit", "VPO",
        // "REplacement Trim", "added trim" are partial-scope SOs that
        // almost never match a full doc on scope-only matching. Penalize
        // unless the doc's total corroborates (i.e. the doc really is for
        // the small partial-scope amount).
        if (so.reference && NEGATIVE_REF_PATTERN.test(so.reference) && !totalMatched) {
          confidence -= NEGATIVE_REF_PENALTY;
          reasons.push('neg_ref');
        }
      }

      if (confidence >= minConfidence) {
        pairings.push({
          document_id: doc.id,
          so_id: so.so_id,
          cust_code: so.cust_code,
          confidence: Math.min(confidence, 100),
          match_source: 'jobsite_reconcile',
          match_reasons: reasons,
        });
      }
    }
  }

  return pairings;
}

export async function reconcileJobsite(normAddr: string): Promise<{
  docs: DocRow[];
  sos: SoRow[];
  pairings: JobsitePairing[];
}> {
  const { docs, sos } = await fetchJobsiteData(normAddr);
  if (docs.length === 0 || sos.length === 0) return { docs, sos, pairings: [] };
  const pairings = pairDocsToSos(docs, sos);
  return { docs, sos, pairings };
}

// List jobsites in queue order: unmatched docs at each, descending. Filter
// to jobsites that have at least one resolvable HUBB customer record so we
// know reconciliation has a fighting chance.
export interface JobsiteQueueRow {
  norm_addr: string;
  sample_address: string;
  doc_count: number;
  so_count_estimate: number;
}

export async function listJobsiteQueue(params: { limit: number; offset: number }): Promise<JobsiteQueueRow[]> {
  const sql = getErpSql();
  return sql<JobsiteQueueRow[]>`
    WITH cust_norms AS (
      SELECT DISTINCT bids.hubbell_normalize_address(v) AS norm_addr
      FROM agility_customers c,
           LATERAL bids.hubbell_expand_multi_unit(c.address_1) AS v
      WHERE c.cust_code LIKE ${HUBBELL_CUST_PREFIX}
        AND c.is_deleted = false
    ),
    unmatched AS (
      SELECT
        bids.hubbell_normalize_address(d.extracted_address) AS norm_addr,
        MIN(d.extracted_address) AS sample_address,
        COUNT(*) AS doc_count
      FROM bids.hubbell_documents d
      WHERE d.extracted_address IS NOT NULL
        AND TRIM(d.extracted_address) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM bids.hubbell_document_sos s WHERE s.document_id = d.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM bids.hubbell_document_suggestions sg
          WHERE sg.document_id = d.id AND sg.status IN ('pending','accepted')
        )
      GROUP BY 1
    )
    SELECT
      u.norm_addr,
      u.sample_address,
      u.doc_count::int AS doc_count,
      0::int AS so_count_estimate
    FROM unmatched u
    JOIN cust_norms c USING (norm_addr)
    ORDER BY u.doc_count DESC, u.norm_addr
    LIMIT ${params.limit}
    OFFSET ${params.offset}
  `;
}

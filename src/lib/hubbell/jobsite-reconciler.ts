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
// Partial-scope SO references. Penalty waived when amount also matches (the
// doc really is for the small partial-scope amount).
//   `add(ed|on)?` — matches "add", "added", "addon" (Codex flagged "deck
//     add" / "trim add" still leaking through the original `added`-only
//     pattern, 23 candidates in the queue)
//   `correction|correct` — added with PR #430
//   `credit|cred|replacement|repl|vpo` — original rules
// `missing` added 2026-05-28: Codex flagged "Missing trim" / "missing window"
// SO refs surfacing for full-scope packets. Same partial-scope shape as
// credit/correction/added — penalty waived when amount corroborates.
// `repair|change` added 2026-05-28 from Codex's 50/batch session.
const NEGATIVE_REF_PATTERN = /\b(credit|cred|replacement|repl|vpo|add(ed|on)?|correction|correct|missing|repair|change)\b/i;

// Construction-stage partial-scope SOs. "Final Lock" / "Construction Lock"
// are the final-stage lock installation, separate from the original door
// packet. They surface against full exterior-door PDFs because the PDF's
// line items include "Construction Lock RCADJ SC-1" at $0.00 (the
// temporary lock the door ships with), so the matcher's `lock` keyword
// stems and overlaps. The doc is primarily about doors, not locks.
// Same waiver as neg_ref — penalty doesn't fire when amount matches
// (legit final-lock-only PDF would have a small total matching the
// final-lock SO).
const CONSTRUCTION_STAGE_PATTERN = /\b(final|construction)\s+lock\b/i;

// Non-positive-total SO penalty. Credit-memo / return SOs (total < 0)
// and zero-total service-only SOs (total = 0) both represent "no real
// material delivery" and almost never match real material POs/WOs.
// Extended 2026-05-28 to include zero from negative-only: Codex flagged
// 28 zero-total candidates surfacing in a single 50-batch.
const NEGATIVE_TOTAL_PENALTY = 25;

// SO statuses that are terminal-cancelled / closed-without-delivery. Backlog
// matching against these is almost never right: across 33 surfaced candidates
// the user has accepted 0. The pattern: when a job has a cancelled SO and a
// re-issued live SO at the same jobsite with similar scope+amount, the live
// (Invoiced) one is the actual match. Big enough penalty to push scope-only
// matches below the floor without auto-suppressing — leaves room for a
// genuine all-cancelled jobsite to still surface if scope+amount+date all
// align.
const CANCELLED_SO_STATUSES = new Set<string>(['C', 'X']);
const CANCELLED_SO_PENALTY = 25;

// Jobsite-number mismatch penalty. Hubbell SO references frequently embed
// the specific house number on a duplex/cluster — "Trim load #9124",
// "deck pack 16728", "Hardware/Locks #924". When the doc's address points
// at a different street number in the same cluster, the SO is for the
// neighbor and is the wrong target.
// Probed in prod: 273 of 507 pending duplex-side candidates were mismatched,
// 12/12 sampled were neighbor-jobsite false positives — no lot-number /
// PO-number ambiguity. Demote large enough to push scope+amount (45) below
// the conf 30 floor; small enough that a fully-corroborated candidate
// (scope+amount+date = 55) still surfaces at 35 for review.
const JOBSITE_NUMBER_PENALTY = 20;
const STREET_NUM_PATTERN = /^\s*(\d+)/;
const REF_NUM_PATTERN = /\d{3,}/g;

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

// Parent → sub-component map for the "door hardware trap" class of false
// positives. When the doc's line items carry a sub-component keyword
// (hardware/lock/screen), the doc is specifically about that sub-component,
// not the parent assembly. An SO whose reference matches only the parent
// (door/window) is therefore the wrong target — even if amount corroborates,
// the parent SO is for the assembly, not the sub-component.
// Codex flagged the door↔hardware case 4+ times across review batches.
const PARENT_TO_SUBS: Record<string, readonly string[]> = {
  door:   ['hardware', 'lock'],
  window: ['screen'],
};

// Door-subtype mismatch — two-tier model:
//
//   HARD subtypes (patio, scuttle): narrowly specific. SO ref has the
//     keyword AND the doc doesn't share it → demote, regardless of whether
//     the doc has any other subtype info. A doc that doesn't mention
//     `patio` or `scuttle` is almost never patio/scuttle by accident.
//
//   FAMILY subtypes (interior, exterior): symmetric. BOTH sides have a
//     subtype AND they don't share → demote. One-sided cases (one side has
//     a subtype, other is generic) don't demote because generic refs match
//     anything.
//
// History:
//   PR #423 — narrow patio-only asymmetric rule
//   PR #430 — generalized to interior/exterior family match (symmetric)
//   PR #432 (this) — split into HARD + FAMILY tiers + add `scuttle` after
//     Codex flagged Scuttle Doors SOs matching full-scope door packets
const DOOR_SUBTYPE_HARD: Record<string, string> = {
  patio:   'patio',
  scuttle: 'scuttle',
};
const DOOR_SUBTYPE_FAMILY: Record<string, string> = {
  ext:      'exterior',
  exterior: 'exterior',
  int:      'interior',
  interior: 'interior',
};
// NOT included: `dunnage` (Hubbell-side word for rough-opening interior-
// door material; correctly matches interior-doors POs — Codex consistently
// accepts these).

// Frame-subtype family — same shape as DOOR_SUBTYPE_FAMILY. Hubbell SO refs
// often carry a location modifier on framing ("Roof Frame", "basement
// framing", "garage framing", "porch framing") and Hubbell doc line items
// do the same ("Framing Mat. - Roof", "Framing Mat. - Basement"). When
// both sides specify a location AND they don't match, the SO is the wrong
// scope even though `frame` overlaps. Codex flagged this 3+ times across
// review batches (PDF=Basement Framing vs SO=Roof Frame with amount close).
//
// Symmetric like the door FAMILY tier — one-sided cases don't demote
// (generic "Frame" or "Framing" refs still match anything).
const FRAME_SUBTYPE_FAMILY: Record<string, string> = {
  roof:     'roof',
  basement: 'basement',
  garage:   'garage',
  porch:    'porch',
};

function extractSubtypesFromMap(
  text: string,
  map: Record<string, string>,
): Set<string> {
  const lower = text.toLowerCase();
  const out = new Set<string>();
  for (const [raw, canonical] of Object.entries(map)) {
    // Accept abbreviated forms with optional trailing period: ext., int.
    const re = new RegExp(`\\b${raw}\\.?\\b`);
    if (re.test(lower)) out.add(canonical);
  }
  return out;
}

// Returns a string describing the mismatch (for the audit reason), or null
// if no mismatch. HARD tier checks first (asymmetric), then FAMILY tier
// (symmetric). Returns on first mismatch — the audit reason is informative
// but not a complete list of all mismatches found.
function hasDoorSubtypeMismatch(docText: string, refText: string | null | undefined): string | null {
  if (!refText) return null;

  // HARD tier — SO has subtype, doc doesn't share it.
  const refHard = extractSubtypesFromMap(refText, DOOR_SUBTYPE_HARD);
  if (refHard.size > 0) {
    const docHard = extractSubtypesFromMap(docText, DOOR_SUBTYPE_HARD);
    for (const s of refHard) {
      if (!docHard.has(s)) return `hard:${s}`;
    }
  }

  // FAMILY tier — both sides have a subtype, no overlap.
  const refFamily = extractSubtypesFromMap(refText, DOOR_SUBTYPE_FAMILY);
  if (refFamily.size === 0) return null;
  const docFamily = extractSubtypesFromMap(docText, DOOR_SUBTYPE_FAMILY);
  if (docFamily.size === 0) return null;
  for (const s of refFamily) if (docFamily.has(s)) return null;
  return `${[...docFamily].sort().join(',')}!=${[...refFamily].sort().join(',')}`;
}

// Frame-subtype mismatch — same shape as the door FAMILY tier. Both sides
// must specify a location modifier (roof/basement/garage/porch), and they
// must not share. One-sided cases don't demote.
function hasFrameSubtypeMismatch(docText: string, refText: string | null | undefined): string | null {
  if (!refText) return null;
  const refFamily = extractSubtypesFromMap(refText, FRAME_SUBTYPE_FAMILY);
  if (refFamily.size === 0) return null;
  const docFamily = extractSubtypesFromMap(docText, FRAME_SUBTYPE_FAMILY);
  if (docFamily.size === 0) return null;
  for (const s of refFamily) if (docFamily.has(s)) return null;
  return `${[...docFamily].sort().join(',')}!=${[...refFamily].sort().join(',')}`;
}

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

  // Skip "superseded" docs: another row exists at the same r2_key with a
  // later received_at AND a different source_hash. That means the Pi
  // re-uploaded a different PDF under the same `(doc_type, doc_number)`
  // key (Hubbell reused a doc number for a new job — happens) and
  // overwrote the R2 object. The older row's `extracted_*` fields still
  // describe the prior PDF but the R2 file now contains different
  // content, so any suggestion the matcher generates from this row
  // would mismatch what a reviewer actually sees in doc.pdf.
  // 1,391 stale rows exist at writing; 378 have divergent metadata.
  // Reconciler only sources docs from the *current* row per r2_key.
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
      AND NOT EXISTS (
        SELECT 1 FROM bids.hubbell_documents d2
        WHERE d2.r2_key = d.r2_key
          -- Compare (received_at, id) so a batch insert that gives two
          -- rows the same now()-stable timestamp doesn't leave both
          -- treated as "current". Tie-break is arbitrary but deterministic.
          AND (d2.received_at, d2.id) > (d.received_at, d.id)
          AND d2.source_hash IS DISTINCT FROM d.source_hash
          -- Only skip when the later row's metadata also differs. Stale-
          -- identical rows (same metadata across every field the matcher
          -- uses) are matchable: the R2 file under their key now contains
          -- a PDF that describes the same job, so the reviewer will see a
          -- sensible document. Include *every* doc field pairDocsToSos
          -- reads — not just address/total. Otherwise a later row that
          -- shares address+total but has different line_items or
          -- need_by would let the older row through and generate
          -- suggestions whose scope/date reasoning the reviewer can't
          -- see in the actual PDF.
          AND (d2.extracted_address IS DISTINCT FROM d.extracted_address
            OR d2.extracted_total   IS DISTINCT FROM d.extracted_total
            OR d2.extracted_need_by IS DISTINCT FROM d.extracted_need_by
            OR d2.line_items        IS DISTINCT FROM d.line_items)
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
        // Two-stage demotion for broad keywords (frame/lumber):
        //   (a) If the doc *itself* carries any specific keyword (joist,
        //       door, window, …), a broad-only overlap with the SO
        //       contributes 0. Reason: the doc is about something specific
        //       the SO doesn't share, so "frame ↔ frame" is just incidental
        //       (Roof Framing SO vs floor-joist WO false positive).
        //   (b) Else, if the overlap contains no specific keyword (broad-
        //       only), each broad keyword counts at half weight. Avoids
        //       suppressing legitimate framing-pkg ↔ framing-pkg matches
        //       where neither side has a more specific token.
        //   (c) Specific keywords always score at full weight.
        const refScope = extractScopeTokens(so.reference);
        const overlap = scopeOverlap(docScope, refScope);
        const docHasSpecific = Array.from(docScope).some((k) => !BROAD_SCOPE_KEYWORDS.has(k));

        // Parent-component demotion: if the doc carries a sub-component
        // keyword that this candidate's overlap doesn't include, but the
        // overlap is a "parent" of that sub-component (door↔hardware,
        // window↔screen, etc.), this candidate is matching the wrong
        // scope. Drop all parent-matched tokens to 0 weight. Sub-
        // components are still specific enough to score, so a candidate
        // whose ref does contain `hardware`/`screen`/etc. wins.
        const parentMatchedWrongly = new Set<string>();
        for (const k of overlap) {
          const subs = PARENT_TO_SUBS[k];
          if (!subs) continue;
          const docHasSub = subs.some((s) => docScope.has(s));
          const overlapHasSub = subs.some((s) => overlap.includes(s));
          if (docHasSub && !overlapHasSub) parentMatchedWrongly.add(k);
        }

        // Door-subtype mismatch (SP Patio Door SO ↔ Interior Doors doc).
        // Wipes `door` from the overlap when the SO ref specifies a distinct
        // subtype (patio) the doc doesn't share. Treated as a parent-demote
        // for accounting since the effect is identical: kill the `door`
        // scope contribution.
        const docTextForSubtype = descriptionsFromLineItems(doc.line_items);
        const doorSubtypeMismatch = overlap.includes('door')
          ? hasDoorSubtypeMismatch(docTextForSubtype, so.reference)
          : null;
        if (doorSubtypeMismatch) parentMatchedWrongly.add('door');

        // Frame-subtype mismatch — Roof Frame SO vs Basement Framing doc,
        // etc. Same accounting as door subtype: kill the `frame` scope
        // contribution via parent_demote tracking.
        const frameSubtypeMismatch = overlap.includes('frame')
          ? hasFrameSubtypeMismatch(docTextForSubtype, so.reference)
          : null;
        if (frameSubtypeMismatch) parentMatchedWrongly.add('frame');

        // Recompute hasSpecificOverlap AFTER parent/subtype demotes — a
        // demoted specific token (door) shouldn't keep boosting an
        // adjacent broad token (frame) to full weight. Otherwise a
        // patio-door SO with "patio door frame" ref against an interior-
        // doors doc would still surface via the frame=+30 path.
        // Codex P2 #423 caught this.
        const hasSpecificOverlap = overlap.some(
          (k) => !BROAD_SCOPE_KEYWORDS.has(k) && !parentMatchedWrongly.has(k),
        );

        if (overlap.length > 0) {
          let scopeBoost = 0;
          for (const k of overlap) {
            if (parentMatchedWrongly.has(k)) {
              // Doc is about the sub-component; this parent match is
              // incidental. Contribute 0.
              scopeBoost += 0;
              continue;
            }
            const isBroad = BROAD_SCOPE_KEYWORDS.has(k);
            if (!isBroad) {
              scopeBoost += SIGNAL_S_PER_KEYWORD;
            } else if (hasSpecificOverlap) {
              // Broad alongside a specific overlap — keep full weight.
              scopeBoost += SIGNAL_S_PER_KEYWORD;
            } else if (docHasSpecific) {
              // Doc has a specific keyword but the SO doesn't share it —
              // this broad match is incidental. Contribute 0.
              scopeBoost += 0;
            } else {
              // Doc is broad-only (e.g. framing pkg) and SO matches.
              scopeBoost += SIGNAL_S_PER_BROAD_KEYWORD;
            }
          }
          scopeBoost = Math.min(scopeBoost, SIGNAL_S_CAP);
          if (scopeBoost > 0) {
            confidence += scopeBoost;
            const reasonTokens = overlap.filter((k) => !parentMatchedWrongly.has(k));
            if (reasonTokens.length > 0) reasons.push(`scope:${reasonTokens.join('+')}`);
            if (parentMatchedWrongly.size > 0) {
              reasons.push(`parent_demote:${Array.from(parentMatchedWrongly).join('+')}`);
            }
            if (doorSubtypeMismatch) {
              reasons.push(`door_subtype_mismatch:${doorSubtypeMismatch}`);
            }
            if (frameSubtypeMismatch) {
              reasons.push(`frame_subtype_mismatch:${frameSubtypeMismatch}`);
            }
          }
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

        // Construction-stage partial-scope ("Final Lock" / "Construction
        // Lock"). Same waiver as neg_ref — fires only when amount doesn't
        // corroborate. Audit reason `construction_stage` so it's
        // distinguishable from the broader neg_ref bucket.
        if (so.reference && CONSTRUCTION_STAGE_PATTERN.test(so.reference) && !totalMatched) {
          confidence -= NEGATIVE_REF_PENALTY;
          reasons.push('construction_stage');
        }
      }

      // Cancelled-SO penalty — applies to ALL match sources, including
      // Signal A (po_number_split). Codex flagged this: the PR's stated
      // table said a Signal A C-status candidate should land at conf 75,
      // but if this were inside the !Signal-A branch above it would stay
      // at 100. An exact PO# typed into a Cancelled SO's po_number field
      // is rare (the SO is dead, no one types into dead SOs), but if it
      // happens we still want the audit-trail demotion + the conf hit.
      // Across 33 surfaced C-status candidates so far, 0 have been
      // accepted.
      if (so.so_status && CANCELLED_SO_STATUSES.has(so.so_status.toUpperCase())) {
        confidence -= CANCELLED_SO_PENALTY;
        reasons.push(`so_status:${so.so_status.toUpperCase()}_demote`);
      }

      // Negative-total SO demote — credit-memo / return SOs almost never
      // match a real material doc. Applies to all match sources (a
      // po_number_split into a credit SO is rare but possible if the SO
      // was re-issued from a credit).
      if (so.order_total !== null) {
        const t = Number(so.order_total);
        if (Number.isFinite(t) && t <= 0) {
          confidence -= NEGATIVE_TOTAL_PENALTY;
          reasons.push('so_negative_total_demote');
        }
      }

      // Jobsite-number mismatch — when the SO ref embeds a specific street
      // number that disagrees with the doc's address, the SO is for a
      // neighboring address in the same cluster. Applies to ALL match
      // sources because even a po_number_split into the wrong-house SO
      // would be wrong (rare but possible if the buyer typed into the
      // neighbor's SO by mistake). Handles SO refs with multiple street
      // numbers ("Doors #9124 9132") — if ANY number in the ref matches
      // the doc's street number, no penalty.
      const docStreetMatch = doc.extracted_address?.match(STREET_NUM_PATTERN);
      const docStreetNum = docStreetMatch?.[1] ?? null;
      const refNums = so.reference?.match(REF_NUM_PATTERN) ?? null;
      if (docStreetNum && refNums && refNums.length > 0 && !refNums.includes(docStreetNum)) {
        confidence -= JOBSITE_NUMBER_PENALTY;
        reasons.push(`jobsite_num_mismatch:${docStreetNum}!=${refNums.join(',')}`);
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
        -- Skip docs whose R2 file has been overwritten by a later upload
        -- with different content (Hubbell reused the doc_number). See
        -- fetchJobsiteData() above for the full data-shape comment.
        -- Stale-identical rows (later sibling with same metadata, just
        -- byte-drift) are *not* skipped — their R2 file still describes
        -- the same job they expect.
        AND NOT EXISTS (
          SELECT 1 FROM bids.hubbell_documents d2
          WHERE d2.r2_key = d.r2_key
            AND (d2.received_at, d2.id) > (d.received_at, d.id)
            AND d2.source_hash IS DISTINCT FROM d.source_hash
            AND (d2.extracted_address IS DISTINCT FROM d.extracted_address
              OR d2.extracted_total   IS DISTINCT FROM d.extracted_total
              OR d2.extracted_need_by IS DISTINCT FROM d.extracted_need_by
              OR d2.line_items        IS DISTINCT FROM d.line_items)
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

import { describe, it, expect } from 'vitest';
import { pairDocsToSos } from './jobsite-reconciler';

// Table-driven tests for the jobsite reconciler's tuning rules. Each rule
// below corresponds to a documented Codex-review pattern in the CLAUDE.md
// "Hubbell within-jobsite reconciler" section. The matcher is dense — these
// tests pin the *behavior* of each rule so a future tuning change can be
// verified against the existing accept/reject patterns rather than guessed at.
//
// The DocRow / SoRow shapes accepted by pairDocsToSos are minimal — we
// construct just enough fields to exercise each scoring path. Confidence
// numbers are written to match the constants at the top of jobsite-reconciler.ts:
//   SIGNAL_A_CONFIDENCE        = 100  (po_number_split)
//   SIGNAL_S_PER_KEYWORD       =  30  (specific scope overlap, e.g. 'door')
//   SIGNAL_S_PER_BROAD_KEYWORD =  15  (frame/lumber when broad-only)
//   SIGNAL_T_BONUS             =  15  (total within 10%)
//   SIGNAL_D_BONUS             =  10  (date within 90d)
//   NEGATIVE_REF_PENALTY       = -30  (credit/vpo/replacement)
//   CANCELLED_SO_PENALTY       = -25  (so_status C/X)
//   NEGATIVE_TOTAL_PENALTY     = -25  (order_total <= 0)
//   JOBSITE_NUMBER_PENALTY     = -20  (doc street# not in ref nums)

type DocRow = Parameters<typeof pairDocsToSos>[0][number];
type SoRow = Parameters<typeof pairDocsToSos>[1][number];

function doc(overrides: Partial<DocRow> = {}): DocRow {
  return {
    id: 'doc-1',
    doc_number: 'PO1000',
    extracted_address: '1000 Main St',
    extracted_total: null,
    extracted_need_by: null,
    line_items: [],
    ...overrides,
  };
}

function so(overrides: Partial<SoRow> = {}): SoRow {
  return {
    so_id: 5001,
    cust_code: 'HUBB1200',
    so_status: 'I',
    created_date: null,
    reference: null,
    po_number: null,
    order_total: null,
    ...overrides,
  };
}

// Lower the floor in tests so we can assert "this scored X" without the
// 40-point production cutoff suppressing the pairing. Floor changes are a
// product decision tuned against the live queue — not a matcher contract.
const FLOOR = 0;

describe('Signal A — po_number_split (auto-attach)', () => {
  it('exact doc# in po_number → confidence 100', () => {
    const out = pairDocsToSos(
      [doc({ doc_number: '7777' })],
      [so({ po_number: '7777' })],
      FLOOR,
    );
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(100);
    expect(out[0].match_reasons).toContain('po_number_split');
  });

  it('doc# present among multiple comma-separated PO tokens → still matches', () => {
    const out = pairDocsToSos(
      [doc({ doc_number: 'WO123' })],
      [so({ po_number: 'PO1, WO123, PO2' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(100);
  });

  it('normalize: leading-zero-padded doc# matches numeric token', () => {
    const out = pairDocsToSos(
      [doc({ doc_number: '00123' })],
      [so({ po_number: '123' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(100);
  });
});

describe('Signal S — scope keyword overlap', () => {
  it('specific overlap on "door" → +30', () => {
    // Doc and SO both mention "door" only. SO ref does NOT include "frame",
    // so the doc-side frame token has nothing to overlap with — only the
    // door↔door overlap counts.
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Door package' }] })],
      [so({ reference: 'doors load 1' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(30);
    expect(out[0].match_reasons.find((r) => r.startsWith('scope:'))).toBeDefined();
  });
});

describe('Broad keyword half-weight rule (frame/lumber)', () => {
  it('broad-only overlap: doc broad + SO broad → +15', () => {
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Lumber package' }] })],
      [so({ reference: 'Lumber load' })],
      FLOOR,
    );
    // broad-only on both sides → SIGNAL_S_PER_BROAD_KEYWORD = 15
    expect(out[0].confidence).toBe(15);
  });

  it('broad-only with another specific overlap → broad goes back to full weight', () => {
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Door frame package' }] })],
      [so({ reference: 'door frame' })],
      FLOOR,
    );
    // 'door' (+30) + 'frame' (paired-with-specific +30) = 60
    expect(out[0].confidence).toBe(60);
  });

  it('doc has SPECIFIC keyword the SO does not share → broad overlap contributes 0', () => {
    // Doc is about floor joists. SO ref says "Roof Frame". Both share 'frame'.
    // The doc has a specific keyword (joist) the SO doesn't share, so the
    // frame↔frame overlap is incidental and must score 0.
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Floor joist framing material' }] })],
      [so({ reference: 'Roof Frame' })],
      FLOOR,
    );
    // Frame contributes 0; no other overlap. At floor=0 the candidate must
    // still surface so we can prove the score is exactly 0 with no scope
    // reason (a future regression that dropped the candidate would otherwise
    // silently pass).
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(0);
    expect(out[0].match_reasons.find((r) => r.startsWith('scope:'))).toBeUndefined();
  });
});

describe('Parent → sub-component demote (door → hardware/lock, window → screen)', () => {
  it('doc is about door hardware; SO ref says "exterior door" only → "door" contributes 0, no scope reason emitted', () => {
    // Use a non-abbreviated SO ref so we don't accidentally hit the
    // door-subtype-mismatch path (ext/exterior is a recognized family marker
    // — see DOOR_SUBTYPE_FAMILY). Plain "exterior door" without any
    // matching docFamily token leaves only the parent-demote rule active,
    // which is what this test wants to exercise.
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Door Hardware Set with lock' }] })],
      [so({ reference: 'exterior door' })],
      FLOOR,
    );
    // The parent demote zeroes the door contribution. Since scopeBoost is 0,
    // the reasons array stays empty for scope/parent_demote — they're only
    // pushed inside the `scopeBoost > 0` branch. Assert unconditionally that
    // the candidate still surfaces at floor=0 with confidence 0 and no scope
    // reason, so a regression that drops the candidate fails the test.
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(0);
    expect(out[0].match_reasons.find((r) => r.startsWith('scope:'))).toBeUndefined();
  });

  it('SO ref also has the sub-component ("door hardware") → no demote, both score', () => {
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Door Hardware Set' }] })],
      [so({ reference: 'door hardware load' })],
      FLOOR,
    );
    // 'door' specific +30 + 'hardware' specific +30 = 60, no demote
    expect(out[0].confidence).toBe(60);
    expect(out[0].match_reasons.find((r) => r.startsWith('parent_demote'))).toBeUndefined();
  });
});

describe('Negative-reference penalty (credit/vpo/replacement)', () => {
  it('SO ref "Trim Credit" + scope-only match → −30 penalty', () => {
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Trim package' }] })],
      [so({ reference: 'Trim Credit' })],
      FLOOR,
    );
    // 'trim' specific +30, neg_ref −30 = 0. Unconditional assert so a
    // regression that drops the candidate (or pushes score negative below
    // the floor=0 cutoff) fails the test rather than silently passing.
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(0);
    expect(out[0].match_reasons).toContain('neg_ref');
  });

  it('penalty WAIVED when total also matches within 10%', () => {
    const out = pairDocsToSos(
      [
        doc({
          line_items: [{ desc: 'Trim package' }],
          extracted_total: '1000',
        }),
      ],
      [so({ reference: 'Trim Credit', order_total: '1050' })],
      FLOOR,
    );
    // 'trim' +30, total ~10% +15, neg_ref not applied = 45
    expect(out[0].confidence).toBe(45);
    expect(out[0].match_reasons).not.toContain('neg_ref');
    expect(out[0].match_reasons).toContain('total~10%');
  });

  it('penalty fires on "VPO" / "REplacement" / "added" / "missing" / "repair"', () => {
    const refs = ['Trim VPO', 'REplacement door', 'added trim', 'missing window', 'door repair'];
    for (const ref of refs) {
      const out = pairDocsToSos(
        [doc({ line_items: [{ desc: 'Trim door window package' }] })],
        [so({ reference: ref })],
        FLOOR,
      );
      const has = (out[0]?.match_reasons ?? []).includes('neg_ref');
      expect(has, `expected neg_ref on ref "${ref}"`).toBe(true);
    }
  });
});

describe('Cancelled-SO penalty (status C / X) — applies to ALL match sources including Signal A', () => {
  it('Signal A on a Cancelled SO: 100 − 25 = 75', () => {
    const out = pairDocsToSos(
      [doc({ doc_number: '7777' })],
      [so({ po_number: '7777', so_status: 'C' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(75);
    expect(out[0].match_reasons).toContain('po_number_split');
    expect(out[0].match_reasons.some((r) => r.includes('C_demote'))).toBe(true);
  });

  it('case-insensitive: lowercase "x" treated as X', () => {
    const out = pairDocsToSos(
      [doc({ doc_number: '7777' })],
      [so({ po_number: '7777', so_status: 'x' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(75);
  });

  it('"I" (invoiced) does NOT trigger the cancelled penalty', () => {
    const out = pairDocsToSos(
      [doc({ doc_number: '7777' })],
      [so({ po_number: '7777', so_status: 'I' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(100);
  });
});

describe('Negative-total SO penalty (credit-memo SO with order_total ≤ 0)', () => {
  it('Signal A into a credit-memo SO (negative total): 100 − 25 = 75', () => {
    const out = pairDocsToSos(
      [doc({ doc_number: '7777' })],
      [so({ po_number: '7777', order_total: '-500' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(75);
    expect(out[0].match_reasons).toContain('so_negative_total_demote');
  });

  it('zero-total SO also penalized', () => {
    const out = pairDocsToSos(
      [doc({ doc_number: '7777' })],
      [so({ po_number: '7777', order_total: '0' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(75);
  });
});

describe('Jobsite-number mismatch (-20)', () => {
  it('doc at "9108 Robinson Dr" vs SO ref "Trim load #9124" → −20', () => {
    const out = pairDocsToSos(
      [
        doc({
          extracted_address: '9108 Robinson Dr',
          line_items: [{ desc: 'Trim package' }],
        }),
      ],
      [so({ reference: 'Trim load #9124' })],
      FLOOR,
    );
    // 'trim' +30 − jobsite_num_mismatch 20 = 10
    expect(out[0].confidence).toBe(10);
    expect(out[0].match_reasons.some((r) => r.startsWith('jobsite_num_mismatch'))).toBe(true);
  });

  it('multi-number ref where one matches the doc → no penalty', () => {
    const out = pairDocsToSos(
      [
        doc({
          extracted_address: '9132 Robinson Dr',
          line_items: [{ desc: 'Door package' }],
        }),
      ],
      [so({ reference: 'Doors #9124 9132' })],
      FLOOR,
    );
    expect(out[0].match_reasons.find((r) => r.startsWith('jobsite_num_mismatch'))).toBeUndefined();
    expect(out[0].confidence).toBe(30); // 'door' +30, no penalty
  });

  it('SO ref with no street-number-shaped tokens → no penalty (don\'t fabricate signal)', () => {
    const out = pairDocsToSos(
      [
        doc({
          extracted_address: '9108 Robinson Dr',
          line_items: [{ desc: 'Door package' }],
        }),
      ],
      [so({ reference: 'Doors' })],
      FLOOR,
    );
    expect(out[0].confidence).toBe(30);
    expect(out[0].match_reasons.find((r) => r.startsWith('jobsite_num_mismatch'))).toBeUndefined();
  });
});

describe('Confidence floor (minConfidence)', () => {
  it('a candidate below the floor is dropped from the result entirely', () => {
    // 'lumber' is broad; broad-only with doc broad-only → +15. Below floor 40.
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Lumber' }] })],
      [so({ reference: 'lumber' })],
      40,
    );
    expect(out).toHaveLength(0);
  });

  it('default floor of 40 used when minConfidence is omitted', () => {
    // 'door' specific +30, alone — below default 40 floor → no pairing
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Door package' }] })],
      [so({ reference: 'door' })],
    );
    expect(out).toHaveLength(0);
  });

  it('45 (scope+amount) survives the default 40 floor', () => {
    const out = pairDocsToSos(
      [doc({ line_items: [{ desc: 'Door package' }], extracted_total: '1000' })],
      [so({ reference: 'door', order_total: '1050' })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(45);
  });
});

describe('confidence clamping', () => {
  it('caps at 100 even if signals would push higher', () => {
    // Signal A (100) + scope (30) + total (15) + date (10) would be 155.
    // The clamp at Math.min(confidence, 100) on the way out keeps it ≤ 100.
    const today = new Date().toISOString().slice(0, 10);
    const out = pairDocsToSos(
      [
        doc({
          doc_number: '7777',
          line_items: [{ desc: 'door' }],
          extracted_total: '1000',
          extracted_need_by: today,
        }),
      ],
      [
        so({
          po_number: '7777',
          reference: 'door',
          order_total: '1050',
          created_date: today,
        }),
      ],
      FLOOR,
    );
    // Signal A is exclusive — only sets confidence to 100, doesn't add other signals.
    // The clamp still applies on the outward path.
    expect(out[0].confidence).toBeLessThanOrEqual(100);
  });
});

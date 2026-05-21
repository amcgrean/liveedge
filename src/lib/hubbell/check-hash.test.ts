import { describe, it, expect } from 'vitest';
import { canonicalCheckHash } from './check-hash';

describe('canonicalCheckHash', () => {
  const baseLine = {
    doc_type: 'po',
    doc_number: '042150',
    line_seq: 1,
    payment_amount: 1234.56,
    memo: 'DL00006037',
    invoice_date: '2026-05-15',
    gross_amount: 1234.56,
  };

  it('is stable for identical input', () => {
    const a = canonicalCheckHash({ check_number: '015800', lines: [baseLine] });
    const b = canonicalCheckHash({ check_number: '015800', lines: [baseLine] });
    expect(a).toBe(b);
  });

  it('ignores line order in the input', () => {
    const l1 = { ...baseLine, doc_number: '042150', line_seq: 1 };
    const l2 = { ...baseLine, doc_number: '042151', line_seq: 2 };
    const ordered = canonicalCheckHash({ check_number: '015800', lines: [l1, l2] });
    const reversed = canonicalCheckHash({ check_number: '015800', lines: [l2, l1] });
    expect(ordered).toBe(reversed);
  });

  it('is immune to float drift when amounts match in cents', () => {
    const a = canonicalCheckHash({
      check_number: '015800',
      lines: [{ ...baseLine, payment_amount: 100.1 + 200.2 }],
    });
    const b = canonicalCheckHash({
      check_number: '015800',
      lines: [{ ...baseLine, payment_amount: 300.3 }],
    });
    // 100.1 + 200.2 = 300.29999... in float; cents rounding normalizes both to 30030
    expect(a).toBe(b);
  });

  it('changes when payment_amount differs in cents', () => {
    const a = canonicalCheckHash({ check_number: '015800', lines: [baseLine] });
    const b = canonicalCheckHash({
      check_number: '015800',
      lines: [{ ...baseLine, payment_amount: 1234.57 }],
    });
    expect(a).not.toBe(b);
  });

  it('changes when a line is added', () => {
    const a = canonicalCheckHash({ check_number: '015800', lines: [baseLine] });
    const b = canonicalCheckHash({
      check_number: '015800',
      lines: [baseLine, { ...baseLine, doc_number: '042151', line_seq: 2 }],
    });
    expect(a).not.toBe(b);
  });

  it('changes when check_number differs', () => {
    const a = canonicalCheckHash({ check_number: '015800', lines: [baseLine] });
    const b = canonicalCheckHash({ check_number: '015801', lines: [baseLine] });
    expect(a).not.toBe(b);
  });

  it('treats undefined and null memo identically', () => {
    const a = canonicalCheckHash({
      check_number: '015800',
      lines: [{ ...baseLine, memo: undefined }],
    });
    const b = canonicalCheckHash({
      check_number: '015800',
      lines: [{ ...baseLine, memo: null }],
    });
    expect(a).toBe(b);
  });

  it('returns 64-char hex sha256', () => {
    const h = canonicalCheckHash({ check_number: '015800', lines: [baseLine] });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

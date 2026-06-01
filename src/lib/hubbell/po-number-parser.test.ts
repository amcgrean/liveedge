import { describe, it, expect } from 'vitest';
import { parsePoNumberField, normalizeDocNumber } from './po-number-parser';

// These two helpers gate the Hubbell → Agility write-back. parsePoNumberField
// produces the existing-tokens list; normalizeDocNumber decides whether the
// new doc# is already present. A bug here either (a) duplicates a Hubbell #
// every attach, or (b) misses a "this is already there" check and clobbers
// a buyer's manually-typed PO.

describe('parsePoNumberField', () => {
  it('returns empty array for null/undefined/empty', () => {
    expect(parsePoNumberField(null)).toEqual([]);
    expect(parsePoNumberField(undefined)).toEqual([]);
    expect(parsePoNumberField('')).toEqual([]);
    expect(parsePoNumberField('   ')).toEqual([]);
  });

  it('uppercases and trims tokens', () => {
    expect(parsePoNumberField('  po1234  ')).toEqual(['PO1234']);
  });

  it('splits on commas', () => {
    expect(parsePoNumberField('A,B,C')).toEqual(['A', 'B', 'C']);
  });

  it('splits on semicolons, slashes, pipes, whitespace', () => {
    expect(parsePoNumberField('A;B/C|D E\tF')).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('handles mixed separators', () => {
    expect(parsePoNumberField('PO1, PO2; PO3 / PO4')).toEqual(['PO1', 'PO2', 'PO3', 'PO4']);
  });

  it('drops single noise tokens (AND, NA, NONE, hyphens)', () => {
    expect(parsePoNumberField('PO1, AND, NA, PO2, NONE, -')).toEqual(['PO1', 'PO2']);
  });

  it('splits "N/A" into N + A because slash is a separator (documents observed behavior)', () => {
    // "N/A" survives in the output as the two single-letter tokens 'N' and 'A'
    // because the slash splits before the noise filter. This is unlikely to
    // matter in practice (real Hubbell docs don't have "N/A" as a PO#), but
    // is captured here so a future cleanup is deliberate, not accidental.
    expect(parsePoNumberField('PO1, N/A, PO2')).toEqual(['PO1', 'N', 'A', 'PO2']);
  });

  it('dedupes preserving first-seen order', () => {
    expect(parsePoNumberField('PO1, PO2, PO1, PO3, PO2')).toEqual(['PO1', 'PO2', 'PO3']);
  });

  it('dedupes case-insensitively (everything uppercased before compare)', () => {
    expect(parsePoNumberField('po1, PO1, Po1')).toEqual(['PO1']);
  });

  it('collapses repeated separators (no empty tokens)', () => {
    expect(parsePoNumberField('PO1,,PO2,,,PO3')).toEqual(['PO1', 'PO2', 'PO3']);
    expect(parsePoNumberField('PO1   PO2')).toEqual(['PO1', 'PO2']);
  });
});

describe('normalizeDocNumber', () => {
  it('uppercases', () => {
    expect(normalizeDocNumber('po1234')).toBe('PO1234');
  });
  it('trims whitespace', () => {
    expect(normalizeDocNumber('  PO1234  ')).toBe('PO1234');
  });
  it('strips leading zeros when the rest is pure digits', () => {
    expect(normalizeDocNumber('0012345')).toBe('12345');
    expect(normalizeDocNumber('00012345')).toBe('12345');
  });
  it('does NOT strip leading zeros when alphanumeric', () => {
    expect(normalizeDocNumber('PO-2024-001')).toBe('PO-2024-001');
    expect(normalizeDocNumber('00PO123')).toBe('00PO123');
  });
  it('leaves a non-zero-padded number alone', () => {
    expect(normalizeDocNumber('12345')).toBe('12345');
  });
  it('reduces "000123" then compares equal to "123" — idempotency the writeback relies on', () => {
    // The attach route uses normalizeDocNumber on BOTH sides of an equality
    // check to decide "already present?". The pair below MUST match.
    expect(normalizeDocNumber('000123')).toBe(normalizeDocNumber('123'));
  });
});

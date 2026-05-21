import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, clampLimit } from './cursor';

describe('cursor encoding', () => {
  it('round-trips', () => {
    const c = { d: '2026-05-21T00:00:00.000Z', id: 'abc-123' };
    const enc = encodeCursor(c);
    const dec = decodeCursor(enc);
    expect(dec).toEqual(c);
  });

  it('rejects garbage input', () => {
    expect(decodeCursor('not-valid-base64-json')).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('rejects malformed payloads', () => {
    const bad = Buffer.from(JSON.stringify({ x: 1 }), 'utf8').toString('base64url');
    expect(decodeCursor(bad)).toBeNull();
  });
});

describe('clampLimit', () => {
  it('uses fallback for missing/invalid', () => {
    expect(clampLimit(undefined)).toBe(200);
    expect(clampLimit('abc')).toBe(200);
    expect(clampLimit(0)).toBe(200);
    expect(clampLimit(-5)).toBe(200);
  });

  it('caps at max', () => {
    expect(clampLimit(99999)).toBe(1000);
    expect(clampLimit('5000')).toBe(1000);
  });

  it('respects valid values', () => {
    expect(clampLimit(500)).toBe(500);
    expect(clampLimit('250')).toBe(250);
  });

  it('floors fractions', () => {
    expect(clampLimit(100.7)).toBe(100);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ALL_CAPABILITIES,
  CAPABILITIES_METADATA,
  CAPABILITY_CATEGORY_LABELS,
  type CapabilityCategory,
} from './access-control-shared';

// Parity guard between the capability catalog (single source of truth)
// and the surfaces that render it — `GET /api/admin/capabilities` returns
// `CAPABILITIES_METADATA` verbatim, and the admin permissions UI groups
// those rows by `category` using `CAPABILITY_CATEGORY_LABELS` as the tab
// label map. Drift here = silently broken tab in the admin UI or an
// orphan capability that ships with no toggle.

describe('capability catalog parity', () => {
  it('every defined capability has a metadata row', () => {
    const metadataCodes = new Set(CAPABILITIES_METADATA.map((c) => c.code));
    for (const code of ALL_CAPABILITIES) {
      expect(metadataCodes.has(code), `missing metadata for capability ${code}`).toBe(true);
    }
  });

  it('every metadata row references a defined capability', () => {
    for (const row of CAPABILITIES_METADATA) {
      expect(ALL_CAPABILITIES.has(row.code), `metadata row ${row.code} not in CAPABILITIES`).toBe(true);
    }
  });

  it('every category used by a metadata row has a tab label', () => {
    const labelKeys = new Set(Object.keys(CAPABILITY_CATEGORY_LABELS));
    const usedCategories = new Set(CAPABILITIES_METADATA.map((c) => c.category));
    for (const category of usedCategories) {
      expect(
        labelKeys.has(category),
        `category "${category}" has capabilities but no label in CAPABILITY_CATEGORY_LABELS — admin UI will show raw key as the tab name`,
      ).toBe(true);
    }
  });

  it('every tab label maps to at least one capability', () => {
    const usedCategories = new Set(CAPABILITIES_METADATA.map((c) => c.category));
    for (const category of Object.keys(CAPABILITY_CATEGORY_LABELS) as CapabilityCategory[]) {
      expect(
        usedCategories.has(category),
        `label "${category}" has no capabilities — orphan tab in admin UI`,
      ).toBe(true);
    }
  });

  it('label keys match the category type union exactly', () => {
    const expected: CapabilityCategory[] = [
      'operations',
      'dispatch',
      'sales',
      'estimating',
      'purchasing',
      'accounting',
      'admin',
      'cross-cutting',
    ];
    expect(new Set(Object.keys(CAPABILITY_CATEGORY_LABELS))).toEqual(new Set(expected));
  });

  it('every metadata row has a non-empty label and description', () => {
    for (const row of CAPABILITIES_METADATA) {
      expect(row.label.trim().length, `${row.code} has empty label`).toBeGreaterThan(0);
      expect(row.description.trim().length, `${row.code} has empty description`).toBeGreaterThan(0);
    }
  });

  it('risk values are restricted to the known set', () => {
    const allowed = new Set(['low', 'medium', 'high', 'critical']);
    for (const row of CAPABILITIES_METADATA) {
      expect(allowed.has(row.risk), `${row.code} has invalid risk "${row.risk}"`).toBe(true);
    }
  });
});

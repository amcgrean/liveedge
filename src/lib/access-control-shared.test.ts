import { describe, expect, it } from 'vitest';
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  ROLE_DEFAULTS,
  effectiveCapabilities,
  hasCapability,
} from './access-control-shared';
import type { Session } from 'next-auth';

const session = (capabilities: string[] | undefined, hasUser = true): Session =>
  ({
    user: hasUser ? ({ capabilities } as unknown as Session['user']) : undefined,
    expires: '2099-01-01T00:00:00.000Z',
  }) as unknown as Session;

describe('effectiveCapabilities', () => {
  it('returns an empty set when no roles, grants, or revokes', () => {
    expect(effectiveCapabilities([], [], [])).toEqual(new Set());
  });

  it('expands a single role to its defaults', () => {
    const eff = effectiveCapabilities(['sales']);
    for (const cap of ROLE_DEFAULTS.sales) expect(eff.has(cap)).toBe(true);
    expect(eff.has(CAPABILITIES.ADMIN_USERS_MANAGE)).toBe(false);
  });

  it('admin role expands to every capability', () => {
    const eff = effectiveCapabilities(['admin']);
    for (const cap of ALL_CAPABILITIES) expect(eff.has(cap)).toBe(true);
  });

  it('unions defaults across multiple roles', () => {
    const eff = effectiveCapabilities(['sales', 'dispatch']);
    expect(eff.has(CAPABILITIES.SALES_VIEW)).toBe(true);
    expect(eff.has(CAPABILITIES.DISPATCH_MANAGE)).toBe(true);
  });

  it('ignores unknown roles silently', () => {
    expect(effectiveCapabilities(['definitely-not-a-role'])).toEqual(new Set());
  });

  it('grants add capabilities beyond role defaults', () => {
    const eff = effectiveCapabilities(['viewer'], [CAPABILITIES.CREDITS_VIEW]);
    expect(eff.has(CAPABILITIES.SALES_VIEW)).toBe(true); // from viewer
    expect(eff.has(CAPABILITIES.CREDITS_VIEW)).toBe(true); // explicit grant
  });

  it('drops grants that are not in ALL_CAPABILITIES', () => {
    const eff = effectiveCapabilities(['viewer'], ['definitely.not.a.cap']);
    expect(eff.has('definitely.not.a.cap' as never)).toBe(false);
  });

  it('revokes override role defaults', () => {
    const eff = effectiveCapabilities(['sales'], [], [CAPABILITIES.SALES_VIEW]);
    expect(eff.has(CAPABILITIES.SALES_VIEW)).toBe(false);
  });

  it('revokes override grants too (revoke wins)', () => {
    const eff = effectiveCapabilities(
      ['viewer'],
      [CAPABILITIES.CREDITS_VIEW],
      [CAPABILITIES.CREDITS_VIEW]
    );
    expect(eff.has(CAPABILITIES.CREDITS_VIEW)).toBe(false);
  });

  it('admin role can still be revoked capability-by-capability', () => {
    const eff = effectiveCapabilities(['admin'], [], [CAPABILITIES.ADMIN_USERS_MANAGE]);
    expect(eff.has(CAPABILITIES.ADMIN_USERS_MANAGE)).toBe(false);
    // …but other admin caps remain
    expect(eff.has(CAPABILITIES.SALES_VIEW)).toBe(true);
  });
});

describe('effectiveCapabilities edge cases', () => {
  it('revoke wins regardless of grant ordering', () => {
    // Grant + revoke the same cap: revoke should win whether the grant
    // came from a role default or an explicit grant entry.
    const fromRole = effectiveCapabilities(['sales'], [], [CAPABILITIES.SALES_VIEW]);
    const fromGrant = effectiveCapabilities(
      [],
      [CAPABILITIES.SALES_VIEW],
      [CAPABILITIES.SALES_VIEW]
    );
    expect(fromRole.has(CAPABILITIES.SALES_VIEW)).toBe(false);
    expect(fromGrant.has(CAPABILITIES.SALES_VIEW)).toBe(false);
  });

  it('revoking a capability the user never held is a no-op (no throw)', () => {
    expect(() =>
      effectiveCapabilities(['viewer'], [], [CAPABILITIES.ADMIN_USERS_MANAGE])
    ).not.toThrow();
    const eff = effectiveCapabilities(['viewer'], [], [CAPABILITIES.ADMIN_USERS_MANAGE]);
    // viewer's defaults still intact
    expect(eff.has(CAPABILITIES.SALES_VIEW)).toBe(true);
  });

  it('grants alone (no role) yield exactly those grants', () => {
    const eff = effectiveCapabilities(
      [],
      [CAPABILITIES.SALES_VIEW, CAPABILITIES.AR_VIEW]
    );
    expect(eff.size).toBe(2);
    expect(eff.has(CAPABILITIES.SALES_VIEW)).toBe(true);
    expect(eff.has(CAPABILITIES.AR_VIEW)).toBe(true);
  });

  it('overlapping role defaults do not produce duplicates (set semantics)', () => {
    // Both 'estimator' and 'estimating' grant the same caps; the result must
    // still be the union, not a multiset.
    const eff = effectiveCapabilities(['estimator', 'estimating']);
    const expected = new Set(ROLE_DEFAULTS.estimator);
    expect(eff).toEqual(expected);
  });

  it('does not mutate ROLE_DEFAULTS via the returned set', () => {
    const before = ROLE_DEFAULTS.sales.length;
    const eff = effectiveCapabilities(['sales']);
    // Caller could accidentally mutate the Set; ROLE_DEFAULTS should be unchanged.
    eff.delete(CAPABILITIES.SALES_VIEW);
    eff.add(CAPABILITIES.ADMIN_USERS_MANAGE);
    expect(ROLE_DEFAULTS.sales.length).toBe(before);
    expect(ROLE_DEFAULTS.sales).toContain(CAPABILITIES.SALES_VIEW);
    expect(ROLE_DEFAULTS.sales).not.toContain(CAPABILITIES.ADMIN_USERS_MANAGE);
  });

  it('every role default is a valid (known) capability', () => {
    // Guards against a role default drifting after a capability rename — the
    // role would silently grant nothing for that entry without this test.
    for (const [role, caps] of Object.entries(ROLE_DEFAULTS)) {
      for (const cap of caps) {
        expect(
          ALL_CAPABILITIES.has(cap),
          `role "${role}" references unknown capability "${cap}"`
        ).toBe(true);
      }
    }
  });

  it('admin role contains every capability (admin = full access)', () => {
    expect(new Set(ROLE_DEFAULTS.admin)).toEqual(ALL_CAPABILITIES);
  });

  it('driver role is narrowly scoped (dispatch.view only) — guard against accidental privilege creep', () => {
    expect(ROLE_DEFAULTS.driver).toEqual([CAPABILITIES.DISPATCH_VIEW]);
  });

  it('only ops, management, and admin can bypass branch scoping', () => {
    // BRANCH_ALL is critical-risk; any new role getting it by default needs
    // a deliberate decision. If this test breaks, audit who added it.
    const branchAllRoles = Object.entries(ROLE_DEFAULTS)
      .filter(([, caps]) => caps.includes(CAPABILITIES.BRANCH_ALL))
      .map(([role]) => role)
      .sort();
    expect(branchAllRoles).toEqual(['admin', 'management', 'ops']);
  });
});

describe('hasCapability', () => {
  it('returns false when session is null', () => {
    expect(hasCapability(null, CAPABILITIES.SALES_VIEW)).toBe(false);
  });

  it('returns false when session has no user', () => {
    expect(hasCapability(session([], false), CAPABILITIES.SALES_VIEW)).toBe(false);
  });

  it('returns false when capabilities array is missing', () => {
    expect(hasCapability(session(undefined), CAPABILITIES.SALES_VIEW)).toBe(false);
  });

  it('returns true when the requested capability is present', () => {
    expect(hasCapability(session([CAPABILITIES.SALES_VIEW]), CAPABILITIES.SALES_VIEW)).toBe(true);
  });

  it('returns true on any-of match (first matches)', () => {
    expect(
      hasCapability(
        session([CAPABILITIES.SALES_VIEW]),
        CAPABILITIES.SALES_VIEW,
        CAPABILITIES.ADMIN_USERS_MANAGE
      )
    ).toBe(true);
  });

  it('returns true on any-of match (later matches)', () => {
    expect(
      hasCapability(
        session([CAPABILITIES.ADMIN_USERS_MANAGE]),
        CAPABILITIES.SALES_VIEW,
        CAPABILITIES.ADMIN_USERS_MANAGE
      )
    ).toBe(true);
  });

  it('returns false when none of the requested capabilities are present', () => {
    expect(
      hasCapability(session([CAPABILITIES.SALES_VIEW]), CAPABILITIES.ADMIN_USERS_MANAGE)
    ).toBe(false);
  });
});

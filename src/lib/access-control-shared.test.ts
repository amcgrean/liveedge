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

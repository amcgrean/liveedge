// Learned address cache: look up a confirmed SO by normalized address key,
// and write back when an admin manually confirms a match.

import { getDb } from '../../../db/index';
import { hubbellAddressCache } from '../../../db/schema';
import { eq, sql } from 'drizzle-orm';

// Normalize to a stable lookup key: lowercase, abbreviated street types, no punctuation.
export function normalizeAddressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bparkway\b/g, 'pkwy')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\btrail\b/g, 'trl')
    .replace(/\bhighway\b/g, 'hwy')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export type CachedMatch = {
  soId: string;
  systemId: string | null;
  custCode: string | null;
  custName: string | null;
  shiptoAddress: string | null;
  shiptoCity: string | null;
  shiptoState: string | null;
  shiptoZip: string | null;
  confirmedCount: number;
};

export async function checkAddressCache(address: string): Promise<CachedMatch | null> {
  if (!address) return null;
  const key = normalizeAddressKey(address);
  if (!key) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(hubbellAddressCache)
    .where(eq(hubbellAddressCache.addressKey, key));

  if (!row) return null;

  return {
    soId:           row.soId,
    systemId:       row.systemId ?? null,
    custCode:       row.custCode ?? null,
    custName:       row.custName ?? null,
    shiptoAddress:  row.shiptoAddress ?? null,
    shiptoCity:     row.shiptoCity ?? null,
    shiptoState:    row.shiptoState ?? null,
    shiptoZip:      row.shiptoZip ?? null,
    confirmedCount: row.confirmedCount,
  };
}

export async function upsertAddressCache(params: {
  address: string;
  soId: string;
  systemId?: string | null;
  custCode?: string | null;
  custName?: string | null;
  shiptoAddress?: string | null;
  shiptoCity?: string | null;
  shiptoState?: string | null;
  shiptoZip?: string | null;
}): Promise<void> {
  const key = normalizeAddressKey(params.address);
  if (!key) return;

  const db = getDb();
  const now = new Date();

  await db
    .insert(hubbellAddressCache)
    .values({
      addressKey:      key,
      addressRaw:      params.address.slice(0, 255),
      soId:            params.soId,
      systemId:        params.systemId ?? null,
      custCode:        params.custCode ?? null,
      custName:        params.custName ?? null,
      shiptoAddress:   params.shiptoAddress ?? null,
      shiptoCity:      params.shiptoCity ?? null,
      shiptoState:     params.shiptoState ?? null,
      shiptoZip:       params.shiptoZip ?? null,
      confirmedCount:  1,
      lastConfirmedAt: now,
    })
    .onConflictDoUpdate({
      target: hubbellAddressCache.addressKey,
      set: {
        soId:            params.soId,
        systemId:        params.systemId ?? null,
        custCode:        params.custCode ?? null,
        custName:        params.custName ?? null,
        shiptoAddress:   params.shiptoAddress ?? null,
        shiptoCity:      params.shiptoCity ?? null,
        shiptoState:     params.shiptoState ?? null,
        shiptoZip:       params.shiptoZip ?? null,
        confirmedCount:  sql`${hubbellAddressCache.confirmedCount} + 1`,
        lastConfirmedAt: now,
        updatedAt:       now,
      },
    });
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { getErpSql } from '../../../../../db/supabase';
import { hubbellEmails } from '../../../../../db/schema';
import { and, isNotNull, inArray } from 'drizzle-orm';

// Customer codes that represent the same entity and should be merged into one job row.
// Key = alias code (lower-trimmed), value = canonical code to group under.
const CUST_CODE_ALIASES: Record<string, string> = {
  hubb1700: 'hubb1200',
};

function canonicalCustCode(code: string | null): string {
  const c = (code ?? '').trim().toLowerCase();
  return CUST_CODE_ALIASES[c] ?? c;
}

// GET /api/admin/hubbell/jobs
// One row per job site (customer + address), aggregating all confirmed emails and SOs.
// Uses two separate queries (bids DB + ERP DB) to avoid cross-schema permission issues.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getDb();

  // Step 1: Pull all confirmed emails from bids DB
  const confirmedEmails = await db
    .select({
      confirmedSoId:   hubbellEmails.confirmedSoId,
      emailType:       hubbellEmails.emailType,
      extractedAmount: hubbellEmails.extractedAmount,
      receivedAt:      hubbellEmails.receivedAt,
    })
    .from(hubbellEmails)
    .where(and(
      isNotNull(hubbellEmails.confirmedSoId),
      inArray(hubbellEmails.matchStatus, ['confirmed', 'matched']),
    ));

  if (confirmedEmails.length === 0) return NextResponse.json({ jobs: [] });

  // Step 2: Aggregate per SO in JS
  type Stats = { emailCount: number; poCount: number; woCount: number; totalAmount: number; lastReceived: Date };
  const statsMap = new Map<string, Stats>();

  for (const email of confirmedEmails) {
    const soId = email.confirmedSoId!;
    const s = statsMap.get(soId) ?? { emailCount: 0, poCount: 0, woCount: 0, totalAmount: 0, lastReceived: new Date(0) };
    s.emailCount++;
    if (email.emailType === 'po') s.poCount++;
    if (email.emailType === 'wo') s.woCount++;
    s.totalAmount += parseFloat(email.extractedAmount ?? '0') || 0;
    const recv = email.receivedAt ? new Date(String(email.receivedAt)) : new Date(0);
    if (recv > s.lastReceived) s.lastReceived = recv;
    statsMap.set(soId, s);
  }

  const soIds = [...statsMap.keys()];

  const erpSql = getErpSql();

  // Step 3a: Fetch SO headers (no AR join — keep it simple).
  type SoRow = {
    so_id: string;
    cust_code: string | null;
    cust_name: string | null;
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
  };

  const soHeaders = await erpSql<SoRow[]>`
    SELECT
      soh.so_id::text,
      TRIM(soh.cust_code) AS cust_code,
      soh.cust_name,
      soh.shipto_address_1,
      soh.shipto_city,
      soh.shipto_state,
      soh.shipto_zip
    FROM agility_so_header soh
    WHERE soh.so_id::text = ANY(${soIds})
      AND soh.is_deleted = false
  `;

  // Step 3b: Fetch open AR per SO — ref_num in agility_ar_open equals the SO/invoice number.
  // Cast ref_num to text so the ANY() comparison works regardless of stored type.
  type ArRow = { so_id: string; balance: string };
  const arRows = soIds.length
    ? await erpSql<ArRow[]>`
        SELECT ref_num::text AS so_id, SUM(open_amt)::text AS balance
        FROM agility_ar_open
        WHERE ref_num::text = ANY(${soIds})
          AND is_deleted = false
        GROUP BY ref_num
      `
    : [];

  // so_id string → open AR balance for that specific job
  const soArBalance = new Map(arRows.map((r) => [r.so_id, parseFloat(r.balance ?? '0') || 0]));

  // Step 4: Group by job site (canonical cust_code + shipto_address_1).
  // Aliased codes (e.g. hubb1700 → hubb1200) collapse into the same row.
  // AR balance is summed across all SOs in the group.
  type JobGroup = {
    cust_code: string | null;
    cust_name: string | null;
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
    arBalance: number;
    so_ids: string[];
    poCount: number;
    woCount: number;
    totalAmount: number;
    lastReceived: Date;
  };

  const groupMap = new Map<string, JobGroup>();

  for (const so of soHeaders) {
    const s = statsMap.get(so.so_id);
    if (!s) continue;
    const canonical = canonicalCustCode(so.cust_code);
    const key = `${canonical}|${(so.shipto_address_1 ?? '').toLowerCase()}`;
    const g = groupMap.get(key) ?? {
      cust_code:        so.cust_code,
      cust_name:        so.cust_name,
      shipto_address_1: so.shipto_address_1,
      shipto_city:      so.shipto_city,
      shipto_state:     so.shipto_state,
      shipto_zip:       so.shipto_zip,
      arBalance:        0,
      so_ids:           [],
      poCount:          0,
      woCount:          0,
      totalAmount:      0,
      lastReceived:     new Date(0),
    };
    g.so_ids.push(so.so_id);
    g.poCount     += s.poCount;
    g.woCount     += s.woCount;
    g.totalAmount += s.totalAmount;
    g.arBalance   += soArBalance.get(so.so_id) ?? 0;
    if (s.lastReceived > g.lastReceived) g.lastReceived = s.lastReceived;
    groupMap.set(key, g);
  }

  // Sort by most recent email first
  const jobs = [...groupMap.values()]
    .sort((a, b) => b.lastReceived.getTime() - a.lastReceived.getTime())
    .map((g) => ({
      cust_code:        g.cust_code,
      cust_name:        g.cust_name,
      shipto_address_1: g.shipto_address_1,
      shipto_city:      g.shipto_city,
      shipto_state:     g.shipto_state,
      shipto_zip:       g.shipto_zip,
      ar_balance:       String(g.arBalance),
      so_ids:           g.so_ids,
      po_count:         String(g.poCount),
      wo_count:         String(g.woCount),
      total_amount:     String(g.totalAmount),
      last_received:    g.lastReceived.toISOString(),
    }));

  return NextResponse.json({ jobs });
}

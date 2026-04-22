import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { getErpSql } from '../../../../../db/supabase';
import { hubbellEmails } from '../../../../../db/schema';
import { and, isNotNull, inArray } from 'drizzle-orm';

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

  // Step 3: Fetch SO details + AR balance from ERP
  const erpSql = getErpSql();

  type SoRow = {
    so_id: string;
    cust_code: string | null;
    cust_name: string | null;
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
    ar_balance: string | null;
  };

  const soHeaders = await erpSql<SoRow[]>`
    SELECT
      soh.so_id::text,
      TRIM(soh.cust_code)  AS cust_code,
      soh.cust_name,
      soh.shipto_address_1,
      soh.shipto_city,
      soh.shipto_state,
      soh.shipto_zip,
      COALESCE(ar.balance, 0)::text AS ar_balance
    FROM agility_so_header soh
    LEFT JOIN LATERAL (
      SELECT cust_key FROM agility_customers
      WHERE TRIM(cust_code) = TRIM(soh.cust_code) AND is_deleted = false
      LIMIT 1
    ) ac ON true
    LEFT JOIN (
      SELECT cust_key, SUM(open_amt) AS balance
      FROM agility_ar_open
      WHERE is_deleted = false AND open_flag = true
      GROUP BY cust_key
    ) ar ON ar.cust_key = ac.cust_key
    WHERE soh.so_id::text = ANY(${soIds})
      AND soh.is_deleted = false
  `;

  // Step 4: Group by job site (cust_code + shipto_address_1)
  type JobGroup = {
    cust_code: string | null;
    cust_name: string | null;
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
    ar_balance: string | null;
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
    const key = `${so.cust_code ?? ''}|${(so.shipto_address_1 ?? '').toLowerCase()}`;
    const g = groupMap.get(key) ?? {
      cust_code:        so.cust_code,
      cust_name:        so.cust_name,
      shipto_address_1: so.shipto_address_1,
      shipto_city:      so.shipto_city,
      shipto_state:     so.shipto_state,
      shipto_zip:       so.shipto_zip,
      ar_balance:       so.ar_balance,
      so_ids:           [],
      poCount:          0,
      woCount:          0,
      totalAmount:      0,
      lastReceived:     new Date(0),
    };
    g.so_ids.push(so.so_id);
    g.poCount      += s.poCount;
    g.woCount      += s.woCount;
    g.totalAmount  += s.totalAmount;
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
      ar_balance:       g.ar_balance,
      so_ids:           g.so_ids,
      po_count:         String(g.poCount),
      wo_count:         String(g.woCount),
      total_amount:     String(g.totalAmount),
      last_received:    g.lastReceived.toISOString(),
    }));

  return NextResponse.json({ jobs });
}

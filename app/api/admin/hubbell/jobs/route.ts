import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { getErpSql } from '../../../../../db/supabase';
import { sql } from 'drizzle-orm';

export const maxDuration = 30;

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
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const db = getDb();

  // Step 1: Aggregate per confirmedSoId directly in SQL — avoids loading thousands of rows into JS
  type StatsRow = {
    confirmed_so_id: string;
    email_count: string;
    po_count: string;
    wo_count: string;
    total_amount: string;
    last_received: Date;
  };

  const statsRows = await db.execute<StatsRow>(sql`
    SELECT
      confirmed_so_id,
      COUNT(*)::text                                                                   AS email_count,
      COUNT(*) FILTER (WHERE email_type = 'po')::text                                 AS po_count,
      COUNT(*) FILTER (WHERE email_type = 'wo')::text                                 AS wo_count,
      COALESCE(SUM(extracted_amount::numeric) FILTER (WHERE extracted_amount IS NOT NULL), 0)::text AS total_amount,
      MAX(received_at)                                                                 AS last_received
    FROM bids.hubbell_emails
    WHERE confirmed_so_id IS NOT NULL
      AND match_status IN ('confirmed', 'matched')
    GROUP BY confirmed_so_id
  `);

  if (statsRows.length === 0) return NextResponse.json({ jobs: [] });

  type StatsMap = {
    emailCount: number; poCount: number; woCount: number;
    totalAmount: number; lastReceived: Date;
  };
  const statsMap = new Map<string, StatsMap>();
  for (const r of statsRows) {
    statsMap.set(r.confirmed_so_id, {
      emailCount:   parseInt(r.email_count)  || 0,
      poCount:      parseInt(r.po_count)     || 0,
      woCount:      parseInt(r.wo_count)     || 0,
      totalAmount:  parseFloat(r.total_amount) || 0,
      lastReceived: r.last_received ? new Date(String(r.last_received)) : new Date(0),
    });
  }

  const soIds = [...statsMap.keys()];
  const erpSql = getErpSql();

  // Step 2a: Fetch SO headers from ERP
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

  // Step 2b: Fetch open AR per SO via shipments (shipment_num = invoice = AR ref_num)
  type ArRow = { so_id: string; balance: string };
  const arRows = soIds.length
    ? await erpSql<ArRow[]>`
        SELECT sh.so_id::text AS so_id, SUM(ar.open_amt)::text AS balance
        FROM agility_shipments sh
        JOIN agility_ar_open ar
          ON ar.ref_num    = sh.shipment_num::text
         AND ar.is_deleted = false
         AND ar.open_flag  = true
        WHERE sh.so_id::text = ANY(${soIds})
          AND sh.is_deleted  = false
        GROUP BY sh.so_id
      `
    : [];

  const soArBalance = new Map(arRows.map((r) => [r.so_id, parseFloat(r.balance ?? '0') || 0]));

  // Step 3: Group by job site (canonical cust_code + shipto_address_1)
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

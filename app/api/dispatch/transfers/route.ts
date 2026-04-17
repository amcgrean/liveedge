import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// Beisser branch codes — used to identify inbound POs sourced from another branch.
const BRANCH_CODES = ['10FD', '20GR', '25BW', '40CV'];

// Sale type code used by Agility for inter-branch transfer SOs.
// Confirmed against agility_so_header.sale_type values. Change here if ERP config differs.
const TRANSFER_SALE_TYPE = 'T';

export interface TransferSO {
  so_id: string;
  system_id: string;        // originating (filling) branch
  so_status: string | null;
  expect_date: string | null;
  created_date: string | null;
  reference: string | null;
  dest_cust_code: string | null; // customer code = destination branch customer account
  dest_cust_name: string | null;
  line_count: number;
  ship_via: string | null;
  po_number: string | null;
}

export interface TransferPO {
  po_number: string;
  system_id: string;            // receiving branch
  supplier_code: string | null; // source branch code
  supplier_name: string | null;
  po_status: string | null;
  expect_date: string | null;
  order_date: string | null;
  receipt_count: number;
  line_count: number;
}

// GET /api/dispatch/transfers?branch=20GR
// Returns outbound transfer SOs this branch must fill, and inbound transfer POs
// this branch is waiting to receive from another branch.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'dispatch'].includes(r));

  const branchParam = req.nextUrl.searchParams.get('branch') ?? '';
  const effectiveBranch = isAdmin ? branchParam : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    const branchFilter = effectiveBranch
      ? sql`AND soh.system_id = ${effectiveBranch}`
      : sql``;

    const poBranchFilter = effectiveBranch
      ? sql`AND ph.system_id = ${effectiveBranch}`
      : sql``;

    // ── Outbound transfer SOs ──────────────────────────────────────────────
    // SOs of sale_type = TRANSFER_SALE_TYPE originating at this branch.
    // These are orders this branch must pick and ship to another branch.
    type RawSO = {
      so_id: string;
      system_id: string;
      so_status: string | null;
      expect_date: string | null;
      created_date: string | null;
      reference: string | null;
      cust_code: string | null;
      cust_name: string | null;
      line_count: string;
      ship_via: string | null;
      po_number: string | null;
    };

    const soRows = await sql<RawSO[]>`
      SELECT
        soh.so_id::text,
        soh.system_id,
        soh.so_status,
        soh.expect_date::text,
        soh.created_date::text,
        soh.reference,
        soh.cust_code,
        soh.cust_name,
        soh.ship_via,
        soh.po_number,
        COALESCE(lc.line_count, 0) AS line_count
      FROM agility_so_header soh
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS line_count
        FROM agility_so_lines sol
        WHERE sol.system_id = soh.system_id
          AND sol.so_id     = soh.so_id
          AND sol.is_deleted = false
      ) lc ON true
      WHERE soh.is_deleted = false
        AND UPPER(COALESCE(soh.sale_type, '')) = ${TRANSFER_SALE_TYPE}
        AND soh.so_status NOT IN ('C', 'X')
        ${branchFilter}
      ORDER BY soh.expect_date ASC NULLS LAST, soh.so_id
    `;

    const outbound: TransferSO[] = soRows.map((r) => ({
      so_id: r.so_id,
      system_id: r.system_id,
      so_status: r.so_status?.trim() || null,
      expect_date: r.expect_date,
      created_date: r.created_date,
      reference: r.reference?.trim() || null,
      dest_cust_code: r.cust_code?.trim() || null,
      dest_cust_name: r.cust_name?.trim() || null,
      line_count: parseInt(r.line_count, 10) || 0,
      ship_via: r.ship_via?.trim() || null,
      po_number: r.po_number?.trim() || null,
    }));

    // ── Inbound transfer POs ───────────────────────────────────────────────
    // POs at this branch where the supplier_code matches another Beisser branch.
    // These are orders this branch placed against another branch and is waiting to receive.
    type RawPO = {
      po_number: string;
      system_id: string;
      supplier_code: string | null;
      supplier_name: string | null;
      po_status: string | null;
      expect_date: string | null;
      order_date: string | null;
      receipt_count: string;
      line_count: string;
    };

    const poRows = await sql<RawPO[]>`
      SELECT
        ph.po_id AS po_number,
        ph.system_id,
        ph.supplier_code,
        ph.supplier_name,
        ph.po_status,
        ph.expect_date::text,
        ph.order_date::text,
        COALESCE(rh.receipt_count, 0) AS receipt_count,
        COALESCE(lc.line_count, 0)    AS line_count
      FROM agility_po_header ph
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS receipt_count
        FROM agility_receiving_header rh2
        WHERE rh2.system_id  = ph.system_id
          AND rh2.po_id      = ph.po_id
          AND rh2.is_deleted = false
      ) rh ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS line_count
        FROM agility_po_lines pl
        WHERE pl.system_id  = ph.system_id
          AND pl.po_id      = ph.po_id
          AND pl.is_deleted = false
      ) lc ON true
      WHERE ph.is_deleted = false
        AND UPPER(COALESCE(ph.po_status, '')) NOT IN ('CLOSED','COMPLETE','CANCELLED','CANCELED','VOID','RECEIVED')
        AND UPPER(TRIM(COALESCE(ph.supplier_code, ''))) = ANY(${BRANCH_CODES})
        ${poBranchFilter}
      ORDER BY ph.expect_date ASC NULLS LAST, ph.po_id
    `;

    const inbound: TransferPO[] = poRows.map((r) => ({
      po_number: r.po_number,
      system_id: r.system_id,
      supplier_code: r.supplier_code?.trim() || null,
      supplier_name: r.supplier_name?.trim() || null,
      po_status: r.po_status?.trim() || null,
      expect_date: r.expect_date,
      order_date: r.order_date,
      receipt_count: parseInt(r.receipt_count, 10) || 0,
      line_count: parseInt(r.line_count, 10) || 0,
    }));

    return NextResponse.json({ outbound, inbound });
  } catch (err) {
    console.error('[dispatch/transfers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

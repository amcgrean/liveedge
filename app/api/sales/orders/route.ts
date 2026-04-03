import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface SalesOrder {
  so_number: string;
  system_id: string;
  customer_name: string | null;
  customer_code: string | null;
  address_1: string | null;
  city: string | null;
  expect_date: string | null;
  reference: string | null;
  so_status: string;
  sale_type: string | null;
  ship_via: string | null;
  salesperson: string | null;
  po_number: string | null;
  line_count: number;
}

// GET /api/sales/orders?q=&branch=&status=O&limit=100&page=1&date_from=&date_to=&sale_type=
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const branchParam = searchParams.get('branch') ?? '';
  const statusParam = searchParams.get('status') ?? 'O';
  const limit = Math.min(500, parseInt(searchParams.get('limit') ?? '100', 10) || 100);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const dateFrom = searchParams.get('date_from') ?? '';
  const dateTo = searchParams.get('date_to') ?? '';
  const saleTypeParam = searchParams.get('sale_type') ?? '';

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  const effectiveBranch = isAdmin ? branchParam : (session.user.branch ?? '');
  const offset = (page - 1) * limit;

  try {
    const sql = getErpSql();

    type RawRow = {
      so_number: string;
      system_id: string;
      customer_name: string | null;
      customer_code: string | null;
      address_1: string | null;
      city: string | null;
      expect_date: string | null;
      reference: string | null;
      so_status: string | null;
      sale_type: string | null;
      ship_via: string | null;
      salesperson: string | null;
      po_number: string | null;
      line_count: number;
    };

    // Build query with optional filters using tagged template conditionals
    const rows = await sql<RawRow[]>`
      SELECT
        soh.so_id::text    AS so_number,
        soh.system_id,
        soh.cust_name      AS customer_name,
        soh.cust_code      AS customer_code,
        soh.shipto_address_1 AS address_1,
        soh.shipto_city    AS city,
        soh.expect_date::text AS expect_date,
        soh.reference,
        soh.so_status,
        soh.sale_type,
        soh.ship_via,
        soh.salesperson,
        soh.po_number,
        COUNT(DISTINCT sol.sequence)::int AS line_count
      FROM agility_so_header soh
      LEFT JOIN agility_so_lines sol
        ON sol.system_id = soh.system_id AND sol.so_id = soh.so_id AND sol.is_deleted = false
      WHERE soh.is_deleted = false
        ${statusParam ? sql`AND UPPER(COALESCE(soh.so_status,'')) = ${statusParam.toUpperCase()}` : sql``}
        ${effectiveBranch ? sql`AND soh.system_id = ${effectiveBranch}` : sql``}
        ${q ? sql`AND (
          soh.so_id::text ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.cust_name,'') ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.reference,'') ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.po_number,'') ILIKE ${'%' + q + '%'}
        )` : sql``}
        ${dateFrom ? sql`AND CAST(soh.expect_date AS DATE) >= ${dateFrom}::date` : sql``}
        ${dateTo ? sql`AND CAST(soh.expect_date AS DATE) <= ${dateTo}::date` : sql``}
        ${saleTypeParam ? sql`AND UPPER(COALESCE(soh.sale_type,'')) = ${saleTypeParam.toUpperCase()}` : sql``}
      GROUP BY soh.system_id, soh.so_id, soh.cust_name, soh.cust_code,
               soh.shipto_address_1, soh.shipto_city, soh.expect_date,
               soh.reference, soh.so_status, soh.sale_type, soh.ship_via,
               soh.salesperson, soh.po_number
      ORDER BY soh.expect_date ASC NULLS LAST, soh.so_id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const orders: SalesOrder[] = rows.map((r) => ({
      so_number: r.so_number,
      system_id: r.system_id,
      customer_name: r.customer_name,
      customer_code: r.customer_code,
      address_1: r.address_1,
      city: r.city,
      expect_date: r.expect_date,
      reference: r.reference,
      so_status: r.so_status ?? '',
      sale_type: r.sale_type,
      ship_via: r.ship_via,
      salesperson: r.salesperson,
      po_number: r.po_number,
      line_count: r.line_count,
    }));

    return NextResponse.json({ orders, page, limit });
  } catch (err) {
    console.error('[sales/orders GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

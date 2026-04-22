import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getErpSql } from '../../../db/supabase';

export interface CreditMemo {
  so_id: string;
  system_id: string;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  so_status: string | null;
  salesperson: string | null;
  order_date: string | null;
  expect_date: string | null;
  address_1: string | null;
  city: string | null;
}

// GET /api/credits?q=&branch=&page=1
// Returns open credit memos (sale_type = 'CM', not invoiced/closed/cancelled)
// Branch-scoped: non-admins see only their branch.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q      = (searchParams.get('q') ?? '').trim();
  const branch = searchParams.get('branch') ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit  = 50;
  const offset = (page - 1) * limit;

  // Non-admins are pinned to their own branch
  const isAdmin =
    (session.user as { role?: string }).role === 'admin' ||
    ((session.user as { roles?: string[] }).roles ?? []).some((r) =>
      ['admin', 'supervisor', 'ops'].includes(r)
    );
  const userBranch = (session.user as { branch?: string }).branch ?? '';
  const effectiveBranch = isAdmin ? branch : userBranch;

  try {
    const sql = getErpSql();

    const searchFilter = q
      ? sql`AND (
          soh.so_id::text ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.cust_name,'')   ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.reference,'')   ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.po_number,'')   ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.cust_code,'')   ILIKE ${'%' + q + '%'}
        )`
      : sql``;

    const branchFilter = effectiveBranch
      ? sql`AND soh.system_id = ${effectiveBranch}`
      : sql``;

    type RawRow = {
      so_id: string; system_id: string; cust_code: string | null; cust_name: string | null;
      reference: string | null; po_number: string | null; so_status: string | null;
      salesperson: string | null; order_date: string | null; expect_date: string | null;
      address_1: string | null; city: string | null;
    };

    const [rows, countRows] = await Promise.all([
      sql<RawRow[]>`
        SELECT
          soh.so_id::text,
          soh.system_id,
          TRIM(soh.cust_code)       AS cust_code,
          soh.cust_name,
          soh.reference,
          soh.po_number,
          soh.so_status,
          soh.salesperson,
          soh.order_date::text      AS order_date,
          soh.expect_date::text     AS expect_date,
          soh.shipto_address_1      AS address_1,
          soh.shipto_city           AS city
        FROM agility_so_header soh
        WHERE soh.is_deleted = false
          AND UPPER(COALESCE(soh.sale_type,'')) = 'CM'
          AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
          ${branchFilter}
          ${searchFilter}
        ORDER BY soh.order_date DESC NULLS LAST, soh.so_id DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM agility_so_header soh
        WHERE soh.is_deleted = false
          AND UPPER(COALESCE(soh.sale_type,'')) = 'CM'
          AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
          ${branchFilter}
          ${searchFilter}
      `,
    ]);

    const total = countRows[0]?.total ?? 0;

    const credits: CreditMemo[] = rows.map((r) => ({
      so_id:       r.so_id,
      system_id:   r.system_id,
      cust_code:   r.cust_code?.trim()    || null,
      cust_name:   r.cust_name?.trim()    || null,
      reference:   r.reference?.trim()    || null,
      po_number:   r.po_number?.trim()    || null,
      so_status:   r.so_status?.trim()    || null,
      salesperson: r.salesperson?.trim()  || null,
      order_date:  r.order_date,
      expect_date: r.expect_date,
      address_1:   r.address_1?.trim()    || null,
      city:        r.city?.trim()         || null,
    }));

    return NextResponse.json({ credits, total, page, limit });
  } catch (err) {
    console.error('[credits GET]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

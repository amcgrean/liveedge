import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface OpenWorkOrder {
  wo_id: string;
  so_number: string;
  source: string;
  item_number: string | null;
  description: string | null;
  wo_status: string;
  department: string;
  customer_name: string | null;
  reference: string | null;
  branch_code: string | null;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  assignment_id: number | null;
  assignment_status: string | null;
}

// GET /api/work-orders/open?branch=20GR&department=DOOR1&limit=500
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const branchParam = searchParams.get('branch') ?? '';
  const deptParam = searchParams.get('department') ?? '';
  const limit = Math.min(1000, parseInt(searchParams.get('limit') ?? '500', 10) || 500);

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  const effectiveBranch = isAdmin ? branchParam : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    type RawRow = {
      wo_id: string;
      source_id: string;
      source: string;
      item_number: string | null;
      description: string | null;
      wo_status: string;
      department: string | null;
      cust_name: string | null;
      reference: string | null;
      so_branch: string | null;
      assignment_id: number | null;
      assigned_to_id: number | null;
      assigned_to_name: string | null;
      assignment_status: string | null;
    };

    const rows = await sql<RawRow[]>`
      SELECT
        wh.wo_id::text AS wo_id,
        wh.source_id::text,
        wh.source,
        COALESCE(wh.item_code, sol.item_code)          AS item_number,
        COALESCE(wh.description, sol.description)      AS description,
        wh.wo_status,
        COALESCE(NULLIF(wh.department, ''), wh.wo_rule, '') AS department,
        soh.cust_name,
        soh.reference,
        soh.system_id                                  AS so_branch,
        wa.id                                          AS assignment_id,
        wa.assigned_to_id,
        ps.name                                        AS assigned_to_name,
        wa.status                                      AS assignment_status
      FROM agility_wo_header wh
      LEFT JOIN agility_so_lines sol
        ON sol.so_id = wh.source_id::text AND sol.sequence = wh.source_seq
           AND sol.is_deleted = false
      LEFT JOIN agility_so_header soh
        ON soh.so_id = wh.source_id::text AND soh.is_deleted = false
      LEFT JOIN work_orders wa
        ON wa.work_order_number = wh.wo_id::text AND wa.status != 'Complete'
      LEFT JOIN pickster ps
        ON ps.id = wa.assigned_to_id
      WHERE wh.is_deleted = false
        AND UPPER(COALESCE(wh.wo_status, '')) NOT IN ('COMPLETED', 'CANCELED', 'C')
        ${effectiveBranch ? sql`AND soh.system_id = ${effectiveBranch}` : sql``}
        ${deptParam ? sql`AND UPPER(COALESCE(NULLIF(wh.department,''), wh.wo_rule,'')) = ${deptParam.toUpperCase()}` : sql``}
      ORDER BY wh.wo_id DESC
      LIMIT ${limit}
    `;

    const result: OpenWorkOrder[] = rows.map((r) => ({
      wo_id: r.wo_id,
      so_number: r.source_id,
      source: r.source,
      item_number: r.item_number,
      description: r.description,
      wo_status: r.wo_status,
      department: r.department ?? '',
      customer_name: r.cust_name,
      reference: r.reference,
      branch_code: r.so_branch,
      assigned_to_id: r.assigned_to_id,
      assigned_to_name: r.assigned_to_name,
      assignment_id: r.assignment_id,
      assignment_status: r.assignment_status,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[work-orders/open GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

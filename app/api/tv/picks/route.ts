import { NextRequest, NextResponse } from 'next/server';
import { getErpSql } from '../../../../db/supabase';

// GET /api/tv/picks?branch=20GR&handling_code=DECKING
// TV board data — open picks from ERP enriched with local picker assignments
export async function GET(req: NextRequest) {
  const branch = (req.nextUrl.searchParams.get('branch') ?? '').trim().toUpperCase();
  const handlingCode = (req.nextUrl.searchParams.get('handling_code') ?? '').trim().toUpperCase();

  if (!branch) return NextResponse.json({ error: 'branch required' }, { status: 400 });

  const sql = getErpSql();

  // Open SOs from ERP
  const soRows = await sql`
    SELECT
      soh.so_id,
      soh.cust_name,
      soh.reference,
      soh.so_status,
      soh.expect_date::text,
      soh.sale_type,
      UPPER(COALESCE(sol.handling_code, 'UNROUTED')) AS handling_code,
      COUNT(sol.id)::int AS line_count,
      pr.created_date::text AS pick_printed_date
    FROM agility_so_header soh
    LEFT JOIN agility_so_lines sol
      ON sol.system_id = soh.system_id AND sol.so_id = soh.so_id AND sol.is_deleted = false
    LEFT JOIN (
      SELECT system_id, tran_id AS so_id, MAX(created_date) AS created_date
      FROM agility_picks
      WHERE is_deleted = false
        AND UPPER(COALESCE(print_status, '')) = 'PICK TICKET'
        AND UPPER(COALESCE(tran_type, '')) = 'SO'
        AND created_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY system_id, tran_id
    ) pr ON pr.system_id = soh.system_id AND pr.so_id = soh.so_id
    WHERE soh.is_deleted = false
      AND sol.is_deleted = false
      AND soh.system_id = ${branch}
      AND UPPER(COALESCE(soh.so_status, '')) IN ('K', 'P', 'S')
      AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
      ${handlingCode ? sql`AND UPPER(COALESCE(sol.handling_code, 'UNROUTED')) = ${handlingCode}` : sql``}
    GROUP BY soh.so_id, soh.cust_name, soh.reference, soh.so_status,
             soh.expect_date, soh.sale_type,
             UPPER(COALESCE(sol.handling_code, 'UNROUTED')),
             pr.created_date
    ORDER BY soh.so_id
    LIMIT 200
  `;

  // Picker assignments for this branch
  const assignRows = await sql`
    SELECT pa.so_number, pa.picker_id, ps.name AS picker_name
    FROM pick_assignments pa
    JOIN pickster ps ON ps.id = pa.picker_id
    WHERE pa.branch_code = ${branch} OR pa.branch_code IS NULL
  `;
  const assignMap = new Map(
    (assignRows as unknown as { so_number: string; picker_id: number; picker_name: string }[])
      .map((r) => [r.so_number, { picker_id: r.picker_id, picker_name: r.picker_name }])
  );

  const items = (soRows as unknown as {
    so_id: string; cust_name: string | null; reference: string | null;
    so_status: string | null; expect_date: string | null; sale_type: string | null;
    handling_code: string; line_count: number; pick_printed_date: string | null;
  }[]).map((r) => ({
    so_number: r.so_id,
    customer_name: r.cust_name ?? 'Unknown',
    reference: r.reference,
    so_status: r.so_status,
    expect_date: r.expect_date,
    sale_type: r.sale_type,
    handling_code: r.handling_code,
    line_count: r.line_count,
    pick_printed_date: r.pick_printed_date,
    assigned_picker: assignMap.get(r.so_id) ?? null,
  }));

  return NextResponse.json({ items, branch, handling_code: handlingCode || null });
}

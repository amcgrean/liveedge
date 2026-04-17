import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

export interface JobDetail {
  so_id: string;
  system_id: string;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  sale_type: string | null;
  so_status: string | null;
  ship_via: string | null;
  salesperson: string | null;
  expect_date: string | null;
  address_1: string | null;
  city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  // GPS from agility_customers
  lat: number | null;
  lon: number | null;
  gps_matched: boolean;
  // Customer GPS record context
  cust_key: string | null;
  shipto_seq_num: number | null;
}

// GET /api/admin/jobs/[so_id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ so_id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { so_id } = await params;
  if (!so_id) return NextResponse.json({ error: 'so_id required' }, { status: 400 });

  try {
    const sql = getErpSql();

    type RawRow = {
      so_id: string; system_id: string; cust_code: string | null; cust_name: string | null;
      reference: string | null; po_number: string | null; sale_type: string | null;
      so_status: string | null; ship_via: string | null; salesperson: string | null;
      expect_date: string | null; address_1: string | null; city: string | null;
      shipto_state: string | null; shipto_zip: string | null;
      lat: string | null; lon: string | null;
      cust_key: string | null; shipto_seq_num: number | null;
    };

    const rows = await sql<RawRow[]>`
      SELECT
        soh.so_id::text,
        soh.system_id,
        TRIM(soh.cust_code)          AS cust_code,
        soh.cust_name,
        soh.reference,
        soh.po_number,
        soh.sale_type,
        soh.so_status,
        soh.ship_via,
        soh.salesperson,
        soh.expect_date::text         AS expect_date,
        soh.shipto_address_1          AS address_1,
        soh.shipto_city               AS city,
        soh.shipto_state,
        soh.shipto_zip,
        soh.cust_key::text,
        soh.shipto_seq_num,
        ac.lat::text,
        ac.lon::text
      FROM agility_so_header soh
      LEFT JOIN agility_customers ac
        ON ac.cust_key = soh.cust_key
        AND ac.seq_num = soh.shipto_seq_num
        AND ac.is_deleted = false
      WHERE soh.is_deleted = false
        AND soh.so_id::text = ${so_id}
      LIMIT 1
    `;

    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const r = rows[0];
    const job: JobDetail = {
      so_id:          r.so_id,
      system_id:      r.system_id,
      cust_code:      r.cust_code?.trim()   || null,
      cust_name:      r.cust_name?.trim()   || null,
      reference:      r.reference?.trim()   || null,
      po_number:      r.po_number?.trim()   || null,
      sale_type:      r.sale_type?.trim()   || null,
      so_status:      r.so_status?.trim()   || null,
      ship_via:       r.ship_via?.trim()    || null,
      salesperson:    r.salesperson?.trim() || null,
      expect_date:    r.expect_date,
      address_1:      r.address_1?.trim()   || null,
      city:           r.city?.trim()        || null,
      shipto_state:   r.shipto_state?.trim() || null,
      shipto_zip:     r.shipto_zip?.trim()   || null,
      cust_key:       r.cust_key,
      shipto_seq_num: r.shipto_seq_num,
      lat:            r.lat != null ? parseFloat(r.lat) : null,
      lon:            r.lon != null ? parseFloat(r.lon) : null,
      gps_matched:    r.lat != null && r.lon != null,
    };

    return NextResponse.json(job);
  } catch (err) {
    console.error('[admin/jobs/[so_id] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

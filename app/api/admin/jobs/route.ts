import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface JobRecord {
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
  order_date: string | null;
  expect_date: string | null;
  address_1: string | null;
  city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  lat: number | null;
  lon: number | null;
  gps_matched: boolean;
}

// GET /api/admin/jobs?search=&customer=&gps=all|matched|unmatched&branch=&status=
//   &sort=newest|oldest|expect_date&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&page=1
//
// newest/oldest sort by order_date (job created date); expect_date sorts by delivery date.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const search   = (searchParams.get('search')    ?? '').trim();
  const customer = (searchParams.get('customer')  ?? '').trim();
  const gps      = searchParams.get('gps')       ?? 'all'; // all | matched | unmatched
  const branch   = searchParams.get('branch')    ?? '';
  const status   = searchParams.get('status')    ?? '';
  const sort     = searchParams.get('sort')      ?? 'newest'; // newest | oldest | expect_date
  const dateFrom = searchParams.get('date_from') ?? '';
  const dateTo   = searchParams.get('date_to')   ?? '';
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit    = 50;
  const offset   = (page - 1) * limit;

  try {
    const sql = getErpSql();

    const searchFilter   = search   ? sql`AND (soh.so_id::text ILIKE ${'%' + search + '%'} OR COALESCE(soh.cust_name,'') ILIKE ${'%' + search + '%'} OR COALESCE(soh.reference,'') ILIKE ${'%' + search + '%'} OR COALESCE(soh.po_number,'') ILIKE ${'%' + search + '%'})` : sql``;
    const customerFilter = customer ? sql`AND TRIM(soh.cust_code) ILIKE ${'%' + customer + '%'}` : sql``;
    const branchFilter   = branch   ? sql`AND soh.system_id = ${branch}` : sql``;
    const statusFilter   = status   ? sql`AND UPPER(COALESCE(soh.so_status,'')) = ${status.toUpperCase()}` : sql``;
    const gpsFilter      = gps === 'matched'   ? sql`AND ac.lat IS NOT NULL AND ac.lon IS NOT NULL`
                         : gps === 'unmatched' ? sql`AND (ac.lat IS NULL OR ac.lon IS NULL)`
                         : sql``;
    // order_date range filter (used by "Recently Created" view)
    const dateFromFilter = dateFrom ? sql`AND soh.order_date::date >= ${dateFrom}::date` : sql``;
    const dateToFilter   = dateTo   ? sql`AND soh.order_date::date <= ${dateTo}::date`   : sql``;

    // newest/oldest sort by order_date (the job's actual creation date)
    const orderBy = sort === 'oldest'      ? sql`soh.order_date ASC NULLS LAST, soh.so_id ASC`
                  : sort === 'expect_date' ? sql`soh.expect_date ASC NULLS LAST, soh.so_id DESC`
                  : sql`soh.order_date DESC NULLS LAST, soh.so_id DESC`; // newest (default)

    type RawRow = {
      so_id: string; system_id: string; cust_code: string | null; cust_name: string | null;
      reference: string | null; po_number: string | null; sale_type: string | null;
      so_status: string | null; ship_via: string | null; salesperson: string | null;
      order_date: string | null; expect_date: string | null;
      address_1: string | null; city: string | null;
      shipto_state: string | null; shipto_zip: string | null;
      lat: string | null; lon: string | null;
    };

    const [rows, countRows] = await Promise.all([
      sql<RawRow[]>`
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
          soh.order_date::text          AS order_date,
          soh.expect_date::text         AS expect_date,
          soh.shipto_address_1          AS address_1,
          soh.shipto_city               AS city,
          soh.shipto_state,
          soh.shipto_zip,
          ac.lat::text,
          ac.lon::text
        FROM agility_so_header soh
        LEFT JOIN agility_customers ac
          ON ac.cust_key = soh.cust_key
          AND ac.seq_num = soh.shipto_seq_num
          AND ac.is_deleted = false
        WHERE soh.is_deleted = false
          ${searchFilter}
          ${customerFilter}
          ${branchFilter}
          ${statusFilter}
          ${gpsFilter}
          ${dateFromFilter}
          ${dateToFilter}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM agility_so_header soh
        LEFT JOIN agility_customers ac
          ON ac.cust_key = soh.cust_key
          AND ac.seq_num = soh.shipto_seq_num
          AND ac.is_deleted = false
        WHERE soh.is_deleted = false
          ${searchFilter}
          ${customerFilter}
          ${branchFilter}
          ${statusFilter}
          ${gpsFilter}
          ${dateFromFilter}
          ${dateToFilter}
      `,
    ]);

    const total = countRows[0]?.total ?? 0;

    const jobs: JobRecord[] = rows.map((r) => ({
      so_id:        r.so_id,
      system_id:    r.system_id,
      cust_code:    r.cust_code?.trim()    || null,
      cust_name:    r.cust_name?.trim()    || null,
      reference:    r.reference?.trim()    || null,
      po_number:    r.po_number?.trim()    || null,
      sale_type:    r.sale_type?.trim()    || null,
      so_status:    r.so_status?.trim()    || null,
      ship_via:     r.ship_via?.trim()     || null,
      salesperson:  r.salesperson?.trim()  || null,
      order_date:   r.order_date,
      expect_date:  r.expect_date,
      address_1:    r.address_1?.trim()    || null,
      city:         r.city?.trim()         || null,
      shipto_state: r.shipto_state?.trim() || null,
      shipto_zip:   r.shipto_zip?.trim()   || null,
      lat:          r.lat != null ? parseFloat(r.lat) : null,
      lon:          r.lon != null ? parseFloat(r.lon) : null,
      gps_matched:  r.lat != null && r.lon != null,
    }));

    return NextResponse.json({ jobs, total, page, limit });
  } catch (err) {
    console.error('[admin/jobs GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { getDb, schema } from '../../../../../../../db/index';
import { legacyBid, legacyCustomer } from '../../../../../../../db/schema-legacy';
import { getErpSql } from '../../../../../../../db/supabase';
import { desc, eq, inArray, or, ilike, type SQL } from 'drizzle-orm';

export interface ShipToOrder {
  so_number: string;
  system_id: string | null;
  so_status: string | null;
  sale_type: string | null;
  ship_via: string | null;
  reference: string | null;
  po_number: string | null;
  salesperson: string | null;
  expect_date: string | null;
  created_date: string | null;
  line_count: number;
}

export interface ShipToTakeoff {
  id: string;
  name: string;
  pdfFileName: string | null;
  pageCount: number;
  updatedAt: string | null;
  bidId: string | null;
  legacyBidId: number | null;
  href: string;
}

export interface ShipToQuote {
  id: string;
  name: string;
  status: string | null;
  createdAt: string | null;
  amount: number | null;
}

export interface ShipToDetailResponse {
  customer: {
    cust_code: string;
    cust_name: string | null;
  };
  shipTo: {
    seq_num: number | null;
    shipto_name: string | null;
    address_1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    lat: number | null;
    lon: number | null;
  };
  orders: ShipToOrder[];
  takeoffs: ShipToTakeoff[];
  quotes: ShipToQuote[];
}

// GET /api/sales/customers/[code]/ship-tos/[seq]
// seq = shipto_seq_num as string ("0", "1", ...); "-1" = the "no ship-to" bucket.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string; seq: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, seq } = await params;
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const seqNum = parseInt(seq, 10);
  if (isNaN(seqNum)) return NextResponse.json({ error: 'Invalid seq' }, { status: 400 });

  try {
    const sql = getErpSql();
    const db = getDb();

    type CustRow = { cust_name: string | null };
    type ShipToRow = {
      shipto_name: string | null;
      address_1: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      lat: string | null;
      lon: string | null;
    };
    type OrderRow = {
      so_number: string;
      system_id: string | null;
      so_status: string | null;
      sale_type: string | null;
      ship_via: string | null;
      reference: string | null;
      po_number: string | null;
      salesperson: string | null;
      expect_date: string | null;
      created_date: string | null;
      line_count: number;
    };

    // Filter clause — seq_num = -1 means "no ship-to assigned".
    const seqFilter = seqNum === -1
      ? sql`shipto_seq_num IS NULL`
      : sql`shipto_seq_num = ${seqNum}`;

    const [custRows, shipToRows, orderRows] = await Promise.all([
      sql<CustRow[]>`
        SELECT cust_name
        FROM agility_customers
        WHERE TRIM(cust_code) = TRIM(${code}) AND is_deleted = false
        ORDER BY seq_num NULLS LAST
        LIMIT 1
      `,
      seqNum === -1
        ? Promise.resolve<ShipToRow[]>([])
        : sql<ShipToRow[]>`
            SELECT shipto_name, address_1, city, state, zip, lat::text, lon::text
            FROM agility_customers
            WHERE TRIM(cust_code) = TRIM(${code})
              AND seq_num = ${seqNum}
              AND is_deleted = false
            LIMIT 1
          `,
      sql<OrderRow[]>`
        SELECT
          soh.so_id::text           AS so_number,
          soh.system_id,
          soh.so_status,
          soh.sale_type,
          soh.ship_via,
          soh.reference,
          TRIM(soh.po_number)       AS po_number,
          soh.salesperson,
          soh.expect_date::text     AS expect_date,
          soh.created_date::text    AS created_date,
          COALESCE(
            (SELECT COUNT(*)::int FROM agility_so_lines sl
              WHERE sl.so_id = soh.so_id AND sl.is_deleted = false),
            0
          ) AS line_count
        FROM agility_so_header soh
        WHERE TRIM(soh.cust_code) = TRIM(${code})
          AND soh.is_deleted = false
          AND ${seqFilter}
        ORDER BY COALESCE(soh.expect_date, soh.created_date) DESC NULLS LAST, soh.so_id DESC
        LIMIT 200
      `,
    ]);

    if (!custRows.length) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Fall back to SO-embedded ship-to if no agility_customers row
    const firstOrder = orderRows[0];
    const fallbackRow = firstOrder
      ? await sql<{ address_1: string | null; city: string | null; state: string | null; zip: string | null }[]>`
          SELECT shipto_address_1 AS address_1, shipto_city AS city,
                 shipto_state AS state, shipto_zip AS zip
          FROM agility_so_header
          WHERE so_id::text = ${firstOrder.so_number}
            AND is_deleted = false
          LIMIT 1
        `
      : [];

    const shipTo = shipToRows[0] ?? null;
    const fallback = fallbackRow[0] ?? null;

    // Resolve legacy customer → find their legacy bids → find takeoff sessions.
    // Also find estimator (UUID) bids by customer name/code → their sessions.
    const [legacyCustRow] = await db
      .select({ id: legacyCustomer.id, name: legacyCustomer.name })
      .from(legacyCustomer)
      .where(eq(legacyCustomer.customerCode, code.trim()))
      .limit(1);

    const legacyBidIds: number[] = legacyCustRow
      ? (await db
          .select({ id: legacyBid.id })
          .from(legacyBid)
          .where(eq(legacyBid.customerId, legacyCustRow.id))
        ).map((r) => r.id)
      : [];

    const estimatorBids = await db
      .select({ id: schema.bids.id })
      .from(schema.bids)
      .where(
        or(
          eq(schema.bids.customerCode, code.trim()),
          legacyCustRow ? ilike(schema.bids.customerName, legacyCustRow.name) : undefined
        )
      );
    const estimatorBidIds = estimatorBids.map((r) => r.id);

    // Takeoff sessions linked to any of those bids.
    const sessionFilters: SQL[] = [];
    if (legacyBidIds.length) sessionFilters.push(inArray(schema.takeoffSessions.legacyBidId, legacyBidIds));
    if (estimatorBidIds.length) sessionFilters.push(inArray(schema.takeoffSessions.bidId, estimatorBidIds));

    let sessionRows: {
      id: string;
      name: string;
      pdfFileName: string | null;
      pageCount: number;
      updatedAt: Date | null;
      bidId: string | null;
      legacyBidId: number | null;
    }[] = [];

    if (sessionFilters.length) {
      const whereClause = sessionFilters.length === 1 ? sessionFilters[0] : or(...sessionFilters);
      sessionRows = await db
        .select({
          id: schema.takeoffSessions.id,
          name: schema.takeoffSessions.name,
          pdfFileName: schema.takeoffSessions.pdfFileName,
          pageCount: schema.takeoffSessions.pageCount,
          updatedAt: schema.takeoffSessions.updatedAt,
          bidId: schema.takeoffSessions.bidId,
          legacyBidId: schema.takeoffSessions.legacyBidId,
        })
        .from(schema.takeoffSessions)
        .where(whereClause)
        .orderBy(desc(schema.takeoffSessions.updatedAt))
        .limit(50);
    }

    const takeoffs: ShipToTakeoff[] = sessionRows.map((s) => ({
      id: s.id,
      name: s.name,
      pdfFileName: s.pdfFileName,
      pageCount: s.pageCount,
      updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
      bidId: s.bidId,
      legacyBidId: s.legacyBidId,
      href: `/takeoff/${s.id}`,
    }));

    const response: ShipToDetailResponse = {
      customer: {
        cust_code: code.trim(),
        cust_name: custRows[0].cust_name?.trim() || null,
      },
      shipTo: {
        seq_num: seqNum === -1 ? null : seqNum,
        shipto_name: shipTo?.shipto_name?.trim() || null,
        address_1: (shipTo?.address_1 ?? fallback?.address_1)?.trim() || null,
        city:      (shipTo?.city      ?? fallback?.city)?.trim()      || null,
        state:     (shipTo?.state     ?? fallback?.state)?.trim()     || null,
        zip:       (shipTo?.zip       ?? fallback?.zip)?.trim()       || null,
        lat: shipTo?.lat != null ? parseFloat(shipTo.lat) : null,
        lon: shipTo?.lon != null ? parseFloat(shipTo.lon) : null,
      },
      orders: orderRows.map((r) => ({
        so_number: r.so_number,
        system_id: r.system_id,
        so_status: r.so_status,
        sale_type: r.sale_type,
        ship_via: r.ship_via,
        reference: r.reference,
        po_number: r.po_number,
        salesperson: r.salesperson,
        expect_date: r.expect_date,
        created_date: r.created_date,
        line_count: r.line_count,
      })),
      takeoffs,
      // Quotes table does not exist yet; return empty placeholder so UI can render a section.
      quotes: [],
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[sales/customers/ship-tos/[seq] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyBid, legacyCustomer } from '../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';
import { getErpSql } from '../../../../../db/supabase';

/**
 * GET /api/legacy-bids/:id/ship-tos
 *
 * Returns ship-to addresses for the customer linked to this bid.
 * Used by the "Push to ERP" modal to let the user pick a delivery address.
 *
 * Source: agility_customers mirror table (seq_num >= 1 = ship-tos)
 */

type RouteContext = { params: Promise<{ id: string }> };

export interface ShipTo {
  seqNum: number;
  name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const bidId = parseInt(id, 10);
  if (isNaN(bidId)) return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });

  try {
    const db = getDb();

    // Get customer code from the bid
    const rows = await db
      .select({ customerCode: legacyCustomer.customerCode })
      .from(legacyBid)
      .leftJoin(legacyCustomer, eq(legacyBid.customerId, legacyCustomer.id))
      .where(eq(legacyBid.id, bidId))
      .limit(1);

    if (rows.length === 0) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

    const customerCode = rows[0].customerCode;
    if (!customerCode) {
      return NextResponse.json({ shipTos: [], note: 'No customer code on this bid' });
    }

    // Query ship-tos from ERP mirror table
    const sql = getErpSql();
    type ShipToRow = {
      seq_num: number;
      shipto_name: string | null;
      address_1: string | null;
      address_2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    };

    const shipToRows = await sql<ShipToRow[]>`
      SELECT seq_num, shipto_name, address_1, address_2, city, state, zip
      FROM agility_customers
      WHERE TRIM(cust_code) = TRIM(${customerCode})
        AND is_deleted = false
        AND seq_num >= 1
      ORDER BY seq_num
    `;

    const shipTos: ShipTo[] = shipToRows.map((r) => ({
      seqNum:   r.seq_num,
      name:     r.shipto_name ?? '',
      address1: r.address_1 ?? '',
      address2: r.address_2 ?? null,
      city:     r.city ?? '',
      state:    r.state ?? '',
      zip:      r.zip ?? '',
    }));

    return NextResponse.json({ shipTos, customerCode });
  } catch (err) {
    console.error('[legacy-bids/ship-tos GET]', err);
    return NextResponse.json({ error: 'Failed to load ship-tos' }, { status: 500 });
  }
}

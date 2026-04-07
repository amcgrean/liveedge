import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

type RouteContext = { params: Promise<{ po: string }> };

interface ReceiptLine {
  sequence: number;
  item_number: string | null;
  description: string | null;
  qty: number;
  cost: number | null;
}

interface Receipt {
  receive_num: number;
  receive_date: string | null;
  recv_status: string | null;
  packing_slip: string | null;
  wms_user: string | null;
  recv_comment: string | null;
  lines: ReceiptLine[];
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { po } = await context.params;
  const poNumber = po.trim().toUpperCase();

  try {
    const sql = getErpSql();

    const [headerRows, lineRows, receiptRows] = await Promise.all([
      sql`
        SELECT
          po_id AS po_number, supplier_name, supplier_code, system_id,
          expect_date::text AS expect_date, order_date::text AS order_date, po_status
        FROM agility_po_header
        WHERE po_id = ${poNumber} AND is_deleted = false
        LIMIT 1
      `,
      sql`
        SELECT
          pl.sequence,
          pl.item_code AS item_number,
          pl.description,
          pl.qty_ordered,
          pl.uom AS unit_of_measure,
          pl.cost AS unit_cost,
          COALESCE(rcv.qty_received, 0) AS qty_received
        FROM agility_po_lines pl
        LEFT JOIN (
          SELECT po_id, system_id, sequence, SUM(qty) AS qty_received
          FROM agility_receiving_lines
          WHERE is_deleted = false
          GROUP BY po_id, system_id, sequence
        ) rcv ON rcv.po_id = pl.po_id AND rcv.system_id = pl.system_id AND rcv.sequence = pl.sequence
        WHERE pl.po_id = ${poNumber} AND pl.is_deleted = false
        ORDER BY pl.sequence ASC NULLS LAST
      `,
      // Fetch all receipt headers + their lines in one query, group server-side
      sql`
        SELECT
          rh.receive_num,
          rh.receive_date::text,
          rh.recv_status,
          rh.packing_slip,
          rh.wms_user,
          rh.recv_comment,
          rl.sequence          AS line_seq,
          pl.item_code         AS item_number,
          COALESCE(pl.description, rl.cost::text) AS description,
          rl.qty               AS qty,
          rl.cost              AS cost
        FROM agility_receiving_header rh
        LEFT JOIN agility_receiving_lines rl
          ON rl.system_id = rh.system_id
         AND rl.po_id = rh.po_id
         AND rl.receive_num = rh.receive_num
         AND rl.is_deleted = false
        LEFT JOIN agility_po_lines pl
          ON pl.system_id = rh.system_id
         AND pl.po_id = rh.po_id
         AND pl.sequence = rl.sequence
         AND pl.is_deleted = false
        WHERE rh.po_id = ${poNumber} AND rh.is_deleted = false
        ORDER BY rh.receive_date DESC, rh.receive_num DESC, rl.sequence ASC NULLS LAST
      `,
    ]);

    if (headerRows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Group flat receipt rows into { receive_num, ..., lines[] }
    const receiptsMap = new Map<number, Receipt>();
    for (const row of receiptRows as Record<string, unknown>[]) {
      const num = row.receive_num as number;
      if (!receiptsMap.has(num)) {
        receiptsMap.set(num, {
          receive_num:  num,
          receive_date: row.receive_date as string | null,
          recv_status:  (row.recv_status as string | null)?.trim() || null,
          packing_slip: (row.packing_slip as string | null)?.trim() || null,
          wms_user:     (row.wms_user as string | null)?.trim() || null,
          recv_comment: (row.recv_comment as string | null)?.trim() || null,
          lines: [],
        });
      }
      // Only push if there's an actual line (left join can produce nulls)
      if (row.line_seq != null) {
        receiptsMap.get(num)!.lines.push({
          sequence:    row.line_seq as number,
          item_number: (row.item_number as string | null)?.trim() || null,
          description: (row.description as string | null)?.trim() || null,
          qty:         Number(row.qty),
          cost:        row.cost != null ? Number(row.cost) : null,
        });
      }
    }

    // Total received qty for the summary card
    const totalReceived = lineRows.reduce(
      (sum: number, l: Record<string, unknown>) => sum + Number(l.qty_received ?? 0),
      0,
    );

    return NextResponse.json({
      header:           headerRows[0],
      lines:            lineRows,
      receipts:         Array.from(receiptsMap.values()),
      receiving_summary: {
        receipt_count:  receiptsMap.size,
        last_received:  receiptsMap.size > 0 ? receiptsMap.values().next().value?.receive_date ?? null : null,
        total_received: totalReceived,
      },
    });
  } catch (err) {
    console.error('[purchasing/pos/[po]]', err);
    return NextResponse.json({ error: 'ERP unavailable' }, { status: 503 });
  }
}

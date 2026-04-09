import { NextRequest, NextResponse } from 'next/server';
import { getErpSql } from '../../../../db/supabase';

// Handling code → pick_type_id mapping (matches WH-Tracker helpers.py)
const HANDLING_TO_TYPE: Record<string, number> = {
  'DECK BLDG': 3,
  'DECKING':   3,
  'DOOR1':     2,
  'DOOR 1':    2,
  'EWP':       4,
  'MILLWORK':  5,
  'METALS':    1,
};
const WILL_CALL_TYPE_ID = 6;

const PICK_TYPE_NAMES: Record<number, string> = {
  1: 'Yard',
  2: 'Door 1',
  3: 'Decking',
  4: 'EWP',
  5: 'Millwork',
  6: 'Will Call',
};

function normalizeSONumber(raw: string): string {
  const stripped = raw.replace(/^0+/, '');
  return stripped || '0';
}

function parseBarcode(raw: string): { barcode: string; shipmentNum: string | null } {
  const clean = raw.trim();
  if (clean.includes('-')) {
    const idx = clean.indexOf('-');
    return {
      barcode: normalizeSONumber(clean.slice(0, idx).trim()),
      shipmentNum: clean.slice(idx + 1).trim() || null,
    };
  }
  return { barcode: normalizeSONumber(clean.replace(/\s/g, '')), shipmentNum: null };
}

function pickTypeFromHandlingCode(code: string | null): number {
  if (!code) return 1;
  return HANDLING_TO_TYPE[code.trim().toUpperCase()] ?? 1;
}

// POST /api/kiosk/smart-scan
// Body: { picker_id, barcode, pick_type_id?, branch? }
// No auth required — kiosk runs on trusted in-store devices
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    picker_id?: number;
    barcode?: string;
    pick_type_id?: number;
  };
  const pickerId = body.picker_id;
  const rawBarcode = (body.barcode ?? '').trim();
  // Use the picker's pre-selected type if provided; fall back to ERP auto-detect
  const clientPickTypeId = typeof body.pick_type_id === 'number' ? body.pick_type_id : null;

  if (!pickerId || !rawBarcode) {
    return NextResponse.json({ error: 'picker_id and barcode are required' }, { status: 400 });
  }
  if (!/^[0-9\s\-]+$/.test(rawBarcode) || rawBarcode.length > 50) {
    return NextResponse.json({ error: 'Invalid barcode format' }, { status: 400 });
  }

  const sql = getErpSql();
  const { barcode, shipmentNum } = parseBarcode(rawBarcode);

  // Verify picker exists
  const pickers = await sql<{ id: number; name: string; branch_code: string | null }[]>`
    SELECT id, name, branch_code FROM pickster WHERE id = ${pickerId} LIMIT 1
  `;
  if (!pickers[0]) return NextResponse.json({ error: 'Picker not found' }, { status: 404 });
  const picker = pickers[0];

  const now = new Date();

  // ERP lookup — sale_type, cust_name, handling_code
  let saleType: string | null = null;
  let custName: string | null = null;
  let handlingCode: string | null = null;
  try {
    const soRows = await sql<{ sale_type: string | null; cust_name: string | null; handling_code: string | null }[]>`
      SELECT soh.sale_type,
             soh.cust_name,
             UPPER(COALESCE(sol.handling_code, '')) AS handling_code
      FROM agility_so_header soh
      LEFT JOIN agility_so_lines sol
        ON sol.system_id = soh.system_id AND sol.so_id = soh.so_id
        AND sol.is_deleted = false
      WHERE soh.is_deleted = false AND soh.so_id = ${barcode}
      ORDER BY sol.sequence NULLS LAST
      LIMIT 1
    `;
    if (soRows[0]) {
      saleType = soRows[0].sale_type;
      custName = soRows[0].cust_name;
      handlingCode = soRows[0].handling_code;
    }
  } catch { /* ERP lookup failure — proceed with client type / Yard fallback */ }

  // Will Call: either ERP says so, or picker explicitly selected Will Call
  const isWillCall = saleType?.toUpperCase() === 'WILLCALL' || clientPickTypeId === WILL_CALL_TYPE_ID;

  // 1. Check for existing incomplete pick (branch-scoped) → complete it
  const incompleteRows = await sql<{ id: number; pick_type_id: number | null }[]>`
    SELECT id, pick_type_id FROM pick
    WHERE barcode_number = ${barcode}
      AND completed_time IS NULL
      ${picker.branch_code ? sql`AND branch_code = ${picker.branch_code}` : sql``}
    LIMIT 1
  `;

  if (incompleteRows[0]) {
    const existing = incompleteRows[0];
    await sql`UPDATE pick SET completed_time = ${now} WHERE id = ${existing.id}`;
    await sql`
      INSERT INTO audit_events (event_type, entity_type, entity_id, so_number, actor_id, occurred_at)
      VALUES ('pick_completed', 'pick', ${existing.id}, ${barcode}, ${pickerId}, ${now})
    `;
    return NextResponse.json({
      action: 'completed',
      pick_id: existing.id,
      pick_type: PICK_TYPE_NAMES[existing.pick_type_id ?? 1] ?? 'Unknown',
      so_number: barcode,
      cust_name: custName,
      message: `Pick ${barcode} completed.`,
    });
  }

  // 2. Determine pick type:
  //    - Will Call → type 6, auto-complete
  //    - Picker pre-selected a type → use it
  //    - No pre-selection → auto-detect from ERP handling code
  const pickTypeId = isWillCall
    ? WILL_CALL_TYPE_ID
    : (clientPickTypeId ?? pickTypeFromHandlingCode(handlingCode));

  const completedTime = isWillCall ? now : null;
  const action = isWillCall ? 'will_call_completed' : 'started';
  const message = isWillCall
    ? `Will Call ${barcode} recorded.`
    : `Pick ${barcode} started (${PICK_TYPE_NAMES[pickTypeId]}).`;

  const [newPick] = await sql<{ id: number }[]>`
    INSERT INTO pick (barcode_number, shipment_num, start_time, completed_time,
                      picker_id, pick_type_id, branch_code)
    VALUES (${barcode}, ${shipmentNum}, ${now}, ${completedTime},
            ${pickerId}, ${pickTypeId}, ${picker.branch_code})
    RETURNING id
  `;

  await sql`
    INSERT INTO audit_events (event_type, entity_type, entity_id, so_number, actor_id, occurred_at)
    VALUES (${isWillCall ? 'pick_completed' : 'pick_started'}, 'pick',
            ${newPick.id}, ${barcode}, ${pickerId}, ${now})
  `;

  return NextResponse.json({
    action,
    pick_id: newPick.id,
    pick_type: PICK_TYPE_NAMES[pickTypeId],
    so_number: barcode,
    cust_name: custName,
    message,
  });
}

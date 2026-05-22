import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { itemPlanning } from '../../../../../db/schema';
import { parseCSV } from '@/lib/csv-utils';
import { and, eq } from 'drizzle-orm';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

type CsvRow = {
  systemId?:          string;
  itemCode?:          string;
  minOnHand?:         number | string | null;
  targetOnHand?:      number | string | null;
  safetyStockDays?:   number | string | null;
  usageWindowDays?:   number | string | null;
  seasonalityFactor?: number | string | null;
  packQty?:           number | string | null;
  preferredSupplier?: string | null;
  category?:          string | null;
  isCritical?:        string | boolean | null;
  isPaused?:          string | boolean | null;
  notes?:             string | null;
};

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

function toNumericStr(v: unknown): string | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toTextOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// POST /api/admin/item-planning/import   body = CSV text
// Upserts by (systemId, itemCode). source defaults to 'csv_import'.
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  let text: string;
  try { text = await req.text(); } catch { return NextResponse.json({ error: 'Unable to read body' }, { status: 400 }); }
  if (!text.trim()) return NextResponse.json({ error: 'Empty CSV' }, { status: 400 });

  const { data, errors } = parseCSV<CsvRow>(text);
  if (errors.length > 0) {
    return NextResponse.json({ error: 'CSV parse errors', details: errors.slice(0, 5) }, { status: 400 });
  }

  const db = getDb();
  const updatedBy = session.user?.name ?? null;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skipReasons: string[] = [];

  for (const [i, row] of data.entries()) {
    const systemId = String(row.systemId ?? '').trim();
    const itemCode = String(row.itemCode ?? '').trim();
    if (!systemId || !itemCode) { skipped++; skipReasons.push(`row ${i + 2}: missing systemId or itemCode`); continue; }
    if (!BRANCHES.includes(systemId)) { skipped++; skipReasons.push(`row ${i + 2}: invalid systemId "${systemId}"`); continue; }

    const values = {
      systemId,
      itemCode,
      minOnHand:          toNumericStr(row.minOnHand),
      targetOnHand:       toNumericStr(row.targetOnHand),
      safetyStockDays:    toIntOrNull(row.safetyStockDays),
      usageWindowDays:    toIntOrNull(row.usageWindowDays),
      seasonalityFactor:  toNumericStr(row.seasonalityFactor),
      packQty:            toNumericStr(row.packQty),
      preferredSupplier:  toTextOrNull(row.preferredSupplier),
      category:           toTextOrNull(row.category),
      isCritical:         toBool(row.isCritical),
      isPaused:           toBool(row.isPaused),
      notes:              toTextOrNull(row.notes),
      source:             'csv_import',
      updatedBy,
      updatedAt:          new Date(),
    };

    try {
      const [existing] = await db.select({ id: itemPlanning.id })
        .from(itemPlanning)
        .where(and(eq(itemPlanning.systemId, systemId), eq(itemPlanning.itemCode, itemCode)))
        .limit(1);

      if (existing) {
        await db.update(itemPlanning).set(values).where(eq(itemPlanning.id, existing.id));
        updated++;
      } else {
        await db.insert(itemPlanning).values(values);
        inserted++;
      }
    } catch (err) {
      skipped++;
      skipReasons.push(`row ${i + 2}: ${(err instanceof Error ? err.message : 'insert failed').slice(0, 120)}`);
    }
  }

  return NextResponse.json({
    total: data.length,
    inserted,
    updated,
    skipped,
    skipReasons: skipReasons.slice(0, 20),
  });
}

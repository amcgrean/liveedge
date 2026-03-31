import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyEWP, legacyCustomer } from '../../../../db/schema-legacy';
import { eq, inArray } from 'drizzle-orm';
import { parseCSV } from '@/lib/csv-utils';
import { getSelectedBranchId } from '@/lib/branch-context';

type EWPImportRow = Record<string, unknown> & {
  plan_number?: string;
  customer_code?: string;
  address?: string;
  tji_depth?: string;
  assigned_designer?: string;
  login_date?: string;
  layout_finalized?: string;
  agility_quote?: string;
  imported_stellar?: string;
  notes?: string;
}

function toDateOrNull(val: string | undefined): string | null {
  if (!val || String(val).trim() === '') return null;
  const d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

/** GET — return a sample CSV template */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const template = [
    'plan_number,customer_code,address,tji_depth,assigned_designer,login_date,layout_finalized,agility_quote,imported_stellar,notes',
    'D-2401-001,SMITH,123 Main St Ames IA,9-1/2",Jane Doe,2024-01-15,,,,"Sample note"',
    'D-2401-002,JONES,456 Oak Ave Des Moines IA,11-7/8",,2024-01-20,2024-02-10,,,"Another row"',
  ].join('\n');

  return new Response(template, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="ewp-import-template.csv"',
    },
  });
}

/** POST — import CSV rows into the ewp table */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let csvText: string;
  try {
    csvText = await req.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: 'Empty CSV' }, { status: 400 });
  }

  const { data, errors } = parseCSV<EWPImportRow>(csvText);

  if (errors.length > 0) {
    return NextResponse.json({ error: 'CSV parse errors', details: errors.slice(0, 5) }, { status: 400 });
  }

  if (data.length === 0) {
    return NextResponse.json({ error: 'No rows found in CSV' }, { status: 400 });
  }

  const db = getDb();
  const branchId = await getSelectedBranchId();

  // Collect all unique customer codes to batch-resolve them
  const codes = [...new Set(data.map((r) => String(r.customer_code ?? '').trim()).filter(Boolean))];

  let customerMap: Map<string, number> = new Map();
  if (codes.length > 0) {
    const customers = await db
      .select({ id: legacyCustomer.id, code: legacyCustomer.customerCode })
      .from(legacyCustomer)
      .where(inArray(legacyCustomer.customerCode, codes));
    for (const c of customers) customerMap.set(c.code, c.id);
  }

  let imported = 0;
  let skipped = 0;
  const rowErrors: { row: number; reason: string }[] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const planNumber = String(row.plan_number ?? '').trim();
    const customerCode = String(row.customer_code ?? '').trim();
    const address = String(row.address ?? '').trim();
    const tjiDepth = String(row.tji_depth ?? '').trim();

    if (!planNumber) {
      rowErrors.push({ row: i + 2, reason: 'Missing plan_number' });
      skipped++;
      continue;
    }
    if (!customerCode) {
      rowErrors.push({ row: i + 2, reason: `Row ${planNumber}: missing customer_code` });
      skipped++;
      continue;
    }
    if (!address) {
      rowErrors.push({ row: i + 2, reason: `Row ${planNumber}: missing address` });
      skipped++;
      continue;
    }
    if (!tjiDepth) {
      rowErrors.push({ row: i + 2, reason: `Row ${planNumber}: missing tji_depth` });
      skipped++;
      continue;
    }

    const customerId = customerMap.get(customerCode);
    if (!customerId) {
      rowErrors.push({ row: i + 2, reason: `Row ${planNumber}: customer_code "${customerCode}" not found` });
      skipped++;
      continue;
    }

    try {
      await db.insert(legacyEWP).values({
        planNumber,
        customerId,
        address,
        tjiDepth,
        assignedDesigner: row.assigned_designer ? String(row.assigned_designer).trim() : null,
        loginDate: toDateOrNull(row.login_date) ?? new Date().toISOString().split('T')[0],
        layoutFinalized: toDateOrNull(row.layout_finalized),
        agilityQuote: toDateOrNull(row.agility_quote),
        importedStellar: toDateOrNull(row.imported_stellar),
        notes: row.notes ? String(row.notes).trim() : null,
        lastUpdatedBy: session.user.name ?? 'import',
        lastUpdatedAt: new Date(),
        branchId: branchId ?? null,
      });
      imported++;
    } catch {
      rowErrors.push({ row: i + 2, reason: `Row ${planNumber}: insert failed (possible duplicate)` });
      skipped++;
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    total: data.length,
    errors: rowErrors.slice(0, 20),
  }, { status: imported > 0 ? 200 : 422 });
}

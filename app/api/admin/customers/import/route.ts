import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyCustomer } from '../../../../../db/schema-legacy';
import { parseCSV } from '@/lib/csv-utils';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  try {
    const text = await req.text();
    const { data, errors } = parseCSV<{ customerCode: string; name: string; branch_id?: number; sales_agent?: string }>(text);

    if (errors.length > 0) {
      return NextResponse.json({ error: 'CSV parse errors', details: errors.slice(0, 5) }, { status: 400 });
    }

    const db = getDb();
    let imported = 0;
    let skipped = 0;

    for (const row of data) {
      if (!row.customerCode || !row.name) { skipped++; continue; }
      try {
        await db.insert(legacyCustomer).values({
          customerCode: String(row.customerCode),
          name: String(row.name),
          branchId: row.branch_id ? Number(row.branch_id) : null,
          salesAgent: row.sales_agent ? String(row.sales_agent) : null,
        });
        imported++;
      } catch {
        skipped++; // duplicate or constraint violation
      }
    }

    return NextResponse.json({ imported, skipped, total: data.length });
  } catch (err) {
    console.error('[customers/import]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

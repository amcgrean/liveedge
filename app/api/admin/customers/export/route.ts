import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { legacyCustomer } from '../../../../../db/schema-legacy';
import { asc } from 'drizzle-orm';
import { generateCSV, csvResponse } from '@/lib/csv-utils';

export async function GET() {
  const authResult = await requireCapability('admin.customers.view', 'admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const db = getDb();
    const rows = await db.select().from(legacyCustomer).orderBy(asc(legacyCustomer.name));
    const csv = generateCSV(rows);
    return csvResponse(csv, `customers-${new Date().toISOString().split('T')[0]}.csv`);
  } catch (err) {
    console.error('[customers/export]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

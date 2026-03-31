import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyCustomer } from '../../../../../db/schema-legacy';
import { asc } from 'drizzle-orm';
import { generateCSV, csvResponse } from '@/lib/csv-utils';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

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

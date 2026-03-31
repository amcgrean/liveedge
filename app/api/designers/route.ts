import { NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import { legacyDesigner } from '../../../db/schema-legacy';
import { asc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getDb();
    const designers = await db
      .select({ id: legacyDesigner.id, name: legacyDesigner.name })
      .from(legacyDesigner)
      .orderBy(asc(legacyDesigner.name));
    return NextResponse.json({ designers });
  } catch (err) {
    console.error('[designers API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

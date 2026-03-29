import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb, schema } from '../../../../db/index';
import { eq } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[takeoff/assemblies API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/assemblies  – list all active assemblies with items
// ──────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getDb();

    const assemblies = await db
      .select()
      .from(schema.assemblies)
      .where(eq(schema.assemblies.isActive, true));

    // Load items for all active assemblies
    const assemblyIds = assemblies.map((a: { id: string }) => a.id);

    type AssemblyItem = typeof schema.assemblyItems.$inferSelect;
    let items: AssemblyItem[] = [];

    if (assemblyIds.length > 0) {
      const allItems: AssemblyItem[] = await db
        .select()
        .from(schema.assemblyItems);

      items = allItems.filter((item: AssemblyItem) => assemblyIds.includes(item.assemblyId));
    }

    // Group items by assemblyId
    const itemsByAssembly = new Map<string, AssemblyItem[]>();
    for (const item of items) {
      const existing = itemsByAssembly.get(item.assemblyId) ?? [];
      existing.push(item);
      itemsByAssembly.set(item.assemblyId, existing);
    }

    const result = assemblies.map((assembly: { id: string }) => ({
      ...assembly,
      items: itemsByAssembly.get(assembly.id) ?? [],
    }));

    return NextResponse.json({ assemblies: result });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/takeoff/assemblies  – create assembly
// ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    name: string;
    description?: string;
    category?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 });
  }

  try {
    const db = getDb();

    const [assembly] = await db
      .insert(schema.assemblies)
      .values({
        name: body.name,
        description: body.description ?? null,
        category: body.category ?? null,
      })
      .returning();

    return NextResponse.json({ assembly }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}

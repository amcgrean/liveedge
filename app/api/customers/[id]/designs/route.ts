import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyDesign, legacyDesigner } from '../../../../../db/schema-legacy';
import { eq, desc } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const custId = parseInt(id, 10);
  if (isNaN(custId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const rows = await db
      .select({
        id:                 legacyDesign.id,
        planNumber:         legacyDesign.planNumber,
        planName:           legacyDesign.planName,
        projectAddress:     legacyDesign.projectAddress,
        contractor:         legacyDesign.contractor,
        logDate:            legacyDesign.logDate,
        preliminarySetDate: legacyDesign.preliminarySetDate,
        status:             legacyDesign.status,
        planDescription:    legacyDesign.planDescription,
        squareFootage:      legacyDesign.squareFootage,
        designerName:       legacyDesigner.name,
      })
      .from(legacyDesign)
      .leftJoin(legacyDesigner, eq(legacyDesign.designerId, legacyDesigner.id))
      .where(eq(legacyDesign.customerId, custId))
      .orderBy(desc(legacyDesign.logDate));

    return NextResponse.json({
      designs: rows.map((r) => ({
        id: r.id,
        planNumber: r.planNumber,
        planName: r.planName,
        projectAddress: r.projectAddress,
        contractor: r.contractor ?? null,
        logDate: r.logDate ? r.logDate.toISOString() : null,
        preliminarySetDate: r.preliminarySetDate ? r.preliminarySetDate.toISOString() : null,
        status: r.status ?? 'Active',
        planDescription: r.planDescription ?? null,
        squareFootage: r.squareFootage ?? null,
        designerName: r.designerName ?? null,
        href: `/designs/${r.id}`,
      })),
    });
  } catch (err) {
    console.error('[customers/[id]/designs API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

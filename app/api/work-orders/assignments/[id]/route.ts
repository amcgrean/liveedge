import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

// PATCH /api/work-orders/assignments/[id] — mark complete or update notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { action?: string; notes?: string };

  try {
    const sql = getErpSql();

    if (body.action === 'complete') {
      await sql`
        UPDATE work_orders
        SET status = 'Complete',
            completed_at = NOW(),
            completed_by_id = ${parseInt(session.user.id, 10) || null},
            notes = COALESCE(${body.notes ?? null}, notes)
        WHERE id = ${parseInt(id, 10)}
      `;
    } else if (body.notes !== undefined) {
      await sql`
        UPDATE work_orders SET notes = ${body.notes} WHERE id = ${parseInt(id, 10)}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[work-orders/assignments/[id] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

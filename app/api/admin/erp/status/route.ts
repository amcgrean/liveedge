import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { isErpConfigured } from '../../../../../db/supabase';
import { getDb } from '../../../../../db/index';
import { legacyGeneralAudit } from '../../../../../db/schema-legacy';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/admin/erp/status
 *
 * Returns ERP sync status: whether configured, last sync time, recent sync logs.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const configured = isErpConfigured();

  // Get recent ERP sync audit entries
  let recentSyncs: { id: number; action: string; timestamp: Date; changes: string | null }[] = [];
  try {
    const db = getDb();
    recentSyncs = await db
      .select({
        id: legacyGeneralAudit.id,
        action: legacyGeneralAudit.action,
        timestamp: legacyGeneralAudit.timestamp,
        changes: legacyGeneralAudit.changes,
      })
      .from(legacyGeneralAudit)
      .where(eq(legacyGeneralAudit.modelName, 'ERPSync'))
      .orderBy(desc(legacyGeneralAudit.timestamp))
      .limit(20);
  } catch {
    // Audit table might not exist yet
  }

  return NextResponse.json({
    configured,
    envVars: {
      POSTGRES_URL: !!process.env.POSTGRES_URL,
      POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      CRON_SECRET: !!process.env.CRON_SECRET,
    },
    lastSync: recentSyncs[0]?.timestamp ?? null,
    recentSyncs,
  });
}

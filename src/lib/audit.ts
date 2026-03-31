import { getDb } from '@/db/index';
import { legacyGeneralAudit } from '@/db/schema-legacy';

/**
 * Log an action to the general_audit table.
 * Wraps in try/catch so audit failures never block the primary operation.
 */
export async function logAudit(
  userId: number,
  action: string,
  modelName: string,
  changes?: string
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(legacyGeneralAudit).values({
      userId,
      action,
      modelName,
      changes: changes ?? null,
    });
  } catch (err) {
    console.error('[audit] Failed to log:', err);
  }
}

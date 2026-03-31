/**
 * Granular permission system bridging the legacy UserSecurity table
 * with Next.js API route authorization.
 *
 * The Flask estimating-app stores permissions as boolean flags on the
 * `user_security` table, keyed by `user_type_id`. This module maps
 * those flags to semantic permission strings for use in API routes.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/index';
import {
  legacyUser,
  legacyUserSecurity,
  type LegacyUserSecurity,
} from '@/db/schema-legacy';

// All permission flags from the UserSecurity table
export type Permission =
  | 'admin'
  | 'estimating'
  | 'bid_request'
  | 'design'
  | 'ewp'
  | 'service'
  | 'install'
  | 'picking'
  | 'work_orders'
  | 'dashboards'
  | 'security_10'
  | 'security_11'
  | 'security_12'
  | 'security_13'
  | 'security_14'
  | 'security_15'
  | 'security_16'
  | 'security_17'
  | 'security_18'
  | 'security_19'
  | 'security_20';

// Map UserSecurity columns to Permission strings
const PERMISSION_COLUMNS: Record<Permission, keyof LegacyUserSecurity> = {
  admin: 'admin',
  estimating: 'estimating',
  bid_request: 'bidRequest',
  design: 'design',
  ewp: 'ewp',
  service: 'service',
  install: 'install',
  picking: 'picking',
  work_orders: 'workOrders',
  dashboards: 'dashboards',
  security_10: 'security10',
  security_11: 'security11',
  security_12: 'security12',
  security_13: 'security13',
  security_14: 'security14',
  security_15: 'security15',
  security_16: 'security16',
  security_17: 'security17',
  security_18: 'security18',
  security_19: 'security19',
  security_20: 'security20',
};

/**
 * Get the set of permissions for a user by their legacy integer ID.
 * Looks up the user's user_type_id, then reads the security flags.
 */
export async function getUserPermissions(
  userId: number
): Promise<Set<Permission>> {
  const db = getDb();

  // Get user's user_type_id
  const userRows = await db
    .select({ usertypeId: legacyUser.usertypeId })
    .from(legacyUser)
    .where(eq(legacyUser.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user) return new Set();

  // Get security flags for that user type
  const secRows = await db
    .select()
    .from(legacyUserSecurity)
    .where(eq(legacyUserSecurity.userTypeId, user.usertypeId))
    .limit(1);

  const sec = secRows[0];
  if (!sec) return new Set();

  // Build permission set from true flags
  const perms = new Set<Permission>();
  for (const [perm, col] of Object.entries(PERMISSION_COLUMNS)) {
    if (sec[col] === true) {
      perms.add(perm as Permission);
    }
  }

  return perms;
}

/**
 * Check if a user has a specific permission.
 * Admin users (role === 'admin') bypass all checks.
 */
export async function hasPermission(
  userId: number,
  role: string,
  permission: Permission
): Promise<boolean> {
  if (role === 'admin') return true;
  const perms = await getUserPermissions(userId);
  return perms.has(permission);
}

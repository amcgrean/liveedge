/**
 * Branch context utilities.
 *
 * The Flask estimating-app filters all queries by a session-based branch
 * selection. In Next.js with JWT auth, we store the selected branch in
 * the JWT token (set via auth.ts callbacks) and provide helpers to read it.
 *
 * Users can switch branches via the /api/auth/set-branch endpoint, which
 * updates a cookie that the JWT callback reads on next token refresh.
 */
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { legacyBranch, type LegacyBranch } from '@/db/schema-legacy';

const BRANCH_COOKIE = 'beisser-branch-id';

/**
 * Get the currently selected branch ID from the cookie.
 * Returns null if no branch is selected.
 */
export async function getSelectedBranchId(): Promise<number | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(BRANCH_COOKIE)?.value;
  if (!value) return null;
  const id = parseInt(value, 10);
  return isNaN(id) ? null : id;
}

/**
 * Set the selected branch ID cookie.
 */
export async function setSelectedBranchId(branchId: number): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(BRANCH_COOKIE, String(branchId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

/**
 * Get all branches for branch-switcher UI.
 */
export async function getAllBranches(): Promise<LegacyBranch[]> {
  const db = getDb();
  return db.select().from(legacyBranch).orderBy(legacyBranch.branchName);
}

/**
 * Get a single branch by ID.
 */
export async function getBranchById(
  branchId: number
): Promise<LegacyBranch | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(legacyBranch)
    .where(eq(legacyBranch.branchId, branchId))
    .limit(1);
  return rows[0];
}

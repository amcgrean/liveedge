/**
 * Branch context utilities.
 *
 * Two cookies are maintained:
 *  - `beisser-branch-id`   (httpOnly)  — integer branch ID for legacy bids queries
 *  - `beisser-branch`      (NOT httpOnly) — string branch code like "20GR" for ERP queries
 *    (readable by client JS so TopNav can show current selection without an API round-trip)
 */
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { legacyBranch, type LegacyBranch } from '@/db/schema-legacy';

const BRANCH_ID_COOKIE   = 'beisser-branch-id';
const BRANCH_CODE_COOKIE = 'beisser-branch';

export const BRANCH_OPTIONS = [
  { code: '10FD', label: 'Fort Dodge'  },
  { code: '20GR', label: 'Grimes'      },
  { code: '25BW', label: 'Birchwood'   },
  { code: '40CV', label: 'Coralville'  },
] as const;

export type BranchCode = '10FD' | '20GR' | '25BW' | '40CV';

// ---------------------------------------------------------------------------
// Integer branch ID (legacy bids schema)
// ---------------------------------------------------------------------------

/** Get the currently selected branch ID from the cookie (server-side). */
export async function getSelectedBranchId(): Promise<number | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(BRANCH_ID_COOKIE)?.value;
  if (!value) return null;
  const id = parseInt(value, 10);
  return isNaN(id) ? null : id;
}

/** Set the selected branch ID cookie. */
export async function setSelectedBranchId(branchId: number): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(BRANCH_ID_COOKIE, String(branchId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

// ---------------------------------------------------------------------------
// String branch code (ERP/WH-Tracker modules)
// ---------------------------------------------------------------------------

/** Get the selected branch code string (server-side). */
export async function getSelectedBranchCode(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(BRANCH_CODE_COOKIE)?.value ?? null;
}

/** Set the branch code cookie (client-readable so TopNav can display it). */
export async function setSelectedBranchCode(code: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(BRANCH_CODE_COOKIE, code, {
    httpOnly: false, // Must be client-readable for TopNav
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Get all branches for branch-switcher UI. */
export async function getAllBranches(): Promise<LegacyBranch[]> {
  const db = getDb();
  return db.select().from(legacyBranch).orderBy(legacyBranch.branchName);
}

/** Get a single branch by ID. */
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

/** Get a single branch by code string (e.g. "20GR"). */
export async function getBranchByCode(
  code: string
): Promise<LegacyBranch | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(legacyBranch)
    .where(eq(legacyBranch.branchCode, code))
    .limit(1);
  return rows[0];
}

/**
 * POST /api/admin/users/rehash-passwords
 *
 * Scans all legacy users whose passwords are still stored as plaintext
 * and upgrades them to bcrypt hashes. Requires a dry_run=true param to
 * preview without modifying.
 *
 * Admin-only endpoint. Safe to run multiple times — already-hashed
 * passwords are skipped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyUser } from '../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const BCRYPT_PREFIX_RE = /^\$2[abxy]\$/;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get('dry_run') !== 'false';

  const db = getDb();
  const users = await db
    .select({ id: legacyUser.id, username: legacyUser.username, password: legacyUser.password })
    .from(legacyUser);

  let upgraded = 0;
  let alreadyHashed = 0;
  const skipped: string[] = [];

  for (const user of users) {
    if (BCRYPT_PREFIX_RE.test(user.password)) {
      alreadyHashed++;
      continue;
    }

    // Plaintext password — upgrade it
    if (!dryRun) {
      try {
        const hash = await bcrypt.hash(user.password, 12);
        await db
          .update(legacyUser)
          .set({ password: hash, updatedAt: new Date() })
          .where(eq(legacyUser.id, user.id));
        upgraded++;
      } catch {
        skipped.push(user.username);
      }
    } else {
      upgraded++; // count what would be upgraded
    }
  }

  return NextResponse.json({
    dryRun,
    total: users.length,
    upgraded,
    alreadyHashed,
    skipped,
    message: dryRun
      ? `Dry run: ${upgraded} users would be upgraded to bcrypt. Run with ?dry_run=false to apply.`
      : `Upgraded ${upgraded} users to bcrypt. ${alreadyHashed} already hashed. ${skipped.length} failed.`,
  });
}

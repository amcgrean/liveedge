/**
 * Migrate estimating users from username/password (bids."user") to OTP login (public.app_users).
 *
 * Reads all active estimators and admins from the legacy bids."user" table and upserts them
 * into public.app_users so they can sign in via OTP email code at /ops-login.
 *
 * Safe to re-run — uses ON CONFLICT (email) DO UPDATE, so existing records are updated in-place.
 *
 * Usage:
 *   npx tsx db/migrate-estimators-to-otp.ts
 *
 * Requires POSTGRES_URL_NON_POOLING (or BIDS_DATABASE_URL / POSTGRES_URL) to be set.
 */

import postgres from 'postgres';

const databaseUrl =
  process.env.BIDS_DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error(
    'Error: no database URL configured.\n' +
      'Set BIDS_DATABASE_URL or POSTGRES_URL_NON_POOLING before running this script.'
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

async function run() {
  console.log('Fetching estimating/admin users from bids."user"…');

  const users = await sql<{
    id: number;
    username: string;
    email: string | null;
    is_admin: boolean;
    is_estimator: boolean;
  }[]>`
    SELECT id, username, email, is_admin, is_estimator
    FROM bids."user"
    WHERE is_active = true
      AND (is_estimator = true OR is_admin = true)
    ORDER BY id
  `;

  if (users.length === 0) {
    console.log('No estimating/admin users found — nothing to migrate.');
    await sql.end();
    return;
  }

  console.log(`Found ${users.length} user(s) to upsert into public.app_users.\n`);

  let upserted = 0;
  let skipped = 0;

  for (const user of users) {
    const email = user.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      console.warn(`  [skip] user id=${user.id} username=${user.username} — no valid email`);
      skipped++;
      continue;
    }

    const displayName = user.username;
    const roles = user.is_admin ? ['admin'] : ['estimating'];

    await sql`
      INSERT INTO app_users (email, display_name, roles, branch, is_active)
      VALUES (${email}, ${displayName}, ${JSON.stringify(roles)}, null, true)
      ON CONFLICT (email) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        roles        = EXCLUDED.roles,
        is_active    = true
    `;

    console.log(`  [ok] ${email} → roles=${JSON.stringify(roles)}`);
    upserted++;
  }

  console.log(`\nDone. ${upserted} upserted, ${skipped} skipped (no email).`);
  await sql.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

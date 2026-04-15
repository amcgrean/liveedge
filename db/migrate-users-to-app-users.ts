/**
 * db/migrate-users-to-app-users.ts
 *
 * One-time migration: copy all active users from bids."user" (legacy NextAuth
 * credentials table) into public.app_users (unified auth table) with their
 * bcrypt password hashes, so they can sign in via the unified /login page.
 *
 * Safe to re-run — uses ON CONFLICT (email) DO UPDATE for email-based users
 * and ON CONFLICT (username) DO UPDATE for username-only users.
 *
 * Prerequisites:
 *   1. Run db/bulk-bcrypt-migrate.ts first so all passwords are bcrypt hashes.
 *   2. Ensure public.app_users has username + password_hash columns:
 *      ALTER TABLE public.app_users
 *        ADD COLUMN IF NOT EXISTS username TEXT,
 *        ADD COLUMN IF NOT EXISTS password_hash TEXT;
 *      CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_username
 *        ON public.app_users(username) WHERE username IS NOT NULL;
 *
 * Usage:
 *   npx tsx db/migrate-users-to-app-users.ts
 *
 * Requires POSTGRES_URL_NON_POOLING (or BIDS_DATABASE_URL / POSTGRES_URL).
 *
 * After running, verify with:
 *   SELECT id, email, username, roles, is_active
 *   FROM public.app_users ORDER BY id;
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
  console.log('Fetching all active users from bids."user"…\n');

  const users = await sql<{
    id: number;
    username: string;
    email: string | null;
    full_name: string | null;
    password: string;
    branch_code: string | null;
    is_admin: boolean;
    is_estimator: boolean;
    is_designer: boolean;
    is_purchasing: boolean;
    is_warehouse: boolean;
    is_receiving_yard: boolean;
  }[]>`
    SELECT
      id,
      username,
      email,
      full_name,
      password,
      branch_code,
      is_admin,
      is_estimator,
      is_designer,
      is_purchasing,
      is_warehouse,
      is_receiving_yard
    FROM bids."user"
    WHERE is_active = true
    ORDER BY id
  `;

  if (users.length === 0) {
    console.log('No active users found in bids."user" — nothing to migrate.');
    await sql.end();
    return;
  }

  console.log(`Found ${users.length} user(s) to migrate.\n`);

  let upserted = 0;
  let skipped = 0;

  for (const u of users) {
    // Derive roles array from boolean flags
    const roles: string[] = u.is_admin
      ? ['admin']
      : u.is_estimator
      ? ['estimator']
      : u.is_designer
      ? ['designer']
      : u.is_purchasing
      ? ['purchasing']
      : u.is_warehouse
      ? ['warehouse']
      : u.is_receiving_yard
      ? ['receiving_yard']
      : ['estimator'];

    const displayName = u.full_name?.trim() || u.username;
    const email = u.email?.trim().toLowerCase() || null;
    const username = u.username.trim().toLowerCase();
    const passwordHash = u.password; // Already bcrypt (run bulk-bcrypt-migrate.ts first)
    const branch = u.branch_code?.trim() || null;

    if (email) {
      // Email-based user: upsert by email, also set username + password_hash
      await sql`
        INSERT INTO public.app_users
          (email, display_name, username, password_hash, roles, branch, is_active)
        VALUES
          (${email}, ${displayName}, ${username}, ${passwordHash},
           ${JSON.stringify(roles)}, ${branch}, true)
        ON CONFLICT (email) DO UPDATE SET
          display_name  = EXCLUDED.display_name,
          username      = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          roles         = EXCLUDED.roles,
          is_active     = true
      `;
      console.log(`  [ok] id=${u.id} ${username} <${email}> → roles=${JSON.stringify(roles)}`);
    } else {
      // No email — username-only user; check for existing username first
      const existing = await sql`
        SELECT id FROM public.app_users WHERE username = ${username} LIMIT 1
      `;

      if (existing.length > 0) {
        // Update existing record
        await sql`
          UPDATE public.app_users
          SET display_name  = ${displayName},
              password_hash = ${passwordHash},
              roles         = ${JSON.stringify(roles)},
              branch        = ${branch},
              is_active     = true
          WHERE username = ${username}
        `;
        console.log(`  [upd] id=${u.id} ${username} (no email) → roles=${JSON.stringify(roles)}`);
      } else {
        // Insert new record with a synthetic local email (so NOT NULL email constraint is satisfied)
        const syntheticEmail = `${username}@beisserlumber.local`;
        await sql`
          INSERT INTO public.app_users
            (email, display_name, username, password_hash, roles, branch, is_active)
          VALUES
            (${syntheticEmail}, ${displayName}, ${username}, ${passwordHash},
             ${JSON.stringify(roles)}, ${branch}, true)
          ON CONFLICT (email) DO UPDATE SET
            display_name  = EXCLUDED.display_name,
            username      = EXCLUDED.username,
            password_hash = EXCLUDED.password_hash,
            roles         = EXCLUDED.roles,
            is_active     = true
        `;
        console.log(`  [new] id=${u.id} ${username} (no email → ${syntheticEmail}) → roles=${JSON.stringify(roles)}`);
      }
    }
    upserted++;
  }

  console.log(`\nDone. ${upserted} upserted, ${skipped} skipped.`);
  console.log('\nVerify with:');
  console.log('  SELECT id, email, username, roles, is_active FROM public.app_users ORDER BY id;');
  await sql.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

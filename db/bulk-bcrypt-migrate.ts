/**
 * db/bulk-bcrypt-migrate.ts
 *
 * One-time script: migrate all remaining plaintext passwords in bids."user"
 * to bcrypt hashes (cost 12).
 *
 * Run with:
 *   npx tsx db/bulk-bcrypt-migrate.ts
 *
 * Requires POSTGRES_URL_NON_POOLING (or BIDS_DATABASE_URL / POSTGRES_URL)
 * to be set in the environment.
 *
 * After running, verify with:
 *   SELECT count(*) FROM bids."user" WHERE password NOT LIKE '$2%';
 * Expected result: 0
 *
 * Once this returns 0, the plaintext branch in verifyPassword() (auth.ts)
 * can be removed and replaced with a single bcrypt.compare() call.
 */

import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const BATCH_SIZE = 10;

async function main() {
  const url =
    process.env.BIDS_DATABASE_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL;

  if (!url) {
    console.error('No database URL found in environment.');
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    // Fetch all users with non-bcrypt passwords
    const rows = await sql<{ id: number; username: string; password: string }[]>`
      SELECT id, username, password
      FROM bids."user"
      WHERE password NOT LIKE '$2%'
      ORDER BY id
    `;

    if (rows.length === 0) {
      console.log('No plaintext passwords found — all users already have bcrypt hashes.');
      return;
    }

    console.log(`Found ${rows.length} user(s) with plaintext passwords. Migrating...`);

    let migrated = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (row) => {
          const hash = await bcrypt.hash(row.password, BCRYPT_COST);
          await sql`
            UPDATE bids."user"
            SET password = ${hash}
            WHERE id = ${row.id}
          `;
          migrated++;
          console.log(`  [${migrated}/${rows.length}] Migrated user id=${row.id} (${row.username})`);
        })
      );
    }

    console.log(`\nDone. Migrated ${migrated} user(s).`);
    console.log('You can now remove the plaintext branch from verifyPassword() in auth.ts.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

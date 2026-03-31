/**
 * Supabase (ERP) database connection.
 *
 * This is a SECOND Postgres connection for the Supabase-hosted ERP database.
 * The primary app database remains on Neon (see db/index.ts).
 *
 * Vercel's Supabase integration provides these env vars:
 *   POSTGRES_URL          — pooled connection string (Transaction mode)
 *   POSTGRES_URL_NON_POOLING — direct connection string
 *   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DATABASE, POSTGRES_HOST
 *
 * We use postgres.js (postgres) as the driver since @neondatabase/serverless
 * is Neon-specific and won't work with Supabase's Postgres.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let _erpDb: ReturnType<typeof createErpDb> | null = null;
let _erpSql: ReturnType<typeof postgres> | null = null;

function getErpConnectionString(): string {
  // Prefer non-pooling for Drizzle (avoids pgbouncer issues with prepared statements)
  const url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL;

  if (!url) {
    throw new Error(
      'Supabase/ERP database not configured. ' +
        'Expected POSTGRES_URL_NON_POOLING or POSTGRES_URL environment variable. ' +
        'Connect Supabase to your Vercel project to auto-provision these.'
    );
  }
  return url;
}

function createErpDb() {
  const connectionString = getErpConnectionString();
  _erpSql = postgres(connectionString, {
    // Serverless-friendly settings
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(_erpSql);
}

/**
 * Get the Drizzle instance for the ERP (Supabase) database.
 * Uses singleton pattern like the primary DB.
 */
export function getErpDb() {
  if (!_erpDb) {
    _erpDb = createErpDb();
  }
  return _erpDb;
}

/**
 * Get the raw postgres.js SQL client for raw queries (e.g., introspection).
 */
export function getErpSql() {
  if (!_erpSql) {
    const connectionString = getErpConnectionString();
    _erpSql = postgres(connectionString, { max: 1, idle_timeout: 20, connect_timeout: 10 });
  }
  return _erpSql;
}

/**
 * Check if the ERP database is configured (env vars present).
 */
export function isErpConfigured(): boolean {
  return !!(
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL
  );
}

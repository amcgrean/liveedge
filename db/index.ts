import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as legacySchema from './schema-legacy';

// Supabase connection for the beisser-takeoff app database.
// All app tables live in the `bids` schema on the same Supabase instance
// used for ERP reads (db/supabase.ts points at the same DB, public schema).
//
// Env var resolution order:
//   BIDS_DATABASE_URL          — explicit override if needed
//   POSTGRES_URL               — Vercel Supabase integration pooled URL (preferred — avoids
//                                MaxClientsInSessionMode under concurrent serverless invocations)
//   POSTGRES_URL_NON_POOLING   — direct URL fallback
//
// prepare: false is set so pgBouncer transaction mode works correctly.
function createDb() {
  const databaseUrl =
    process.env.BIDS_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (!databaseUrl) {
    throw new Error(
      'App database not configured. ' +
        'Set BIDS_DATABASE_URL to the Supabase direct connection string, ' +
        'or connect Supabase to your Vercel project.'
    );
  }

  const sql = postgres(databaseUrl, {
    // Serverless-safe: one connection per invocation, released on function exit
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    // Required when using a pooled URL (pgBouncer transaction mode)
    prepare: false,
  });

  return drizzle(sql, { schema: { ...schema, ...legacySchema } });
}

// Singleton — reuses the connection across requests within the same
// serverless function invocation.
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export { schema, legacySchema };

/**
 * Supabase ERP database connection.
 *
 * Both the app tables (bids schema) and the ERP mirror tables (public schema)
 * live in the same Supabase instance. This module provides the connection used
 * specifically for ERP reads against the public schema — keeping the separation
 * explicit even though it's the same underlying database.
 *
 * App tables → db/index.ts  (bids schema, read/write)
 * ERP tables → db/supabase.ts (public schema, read-only)
 *
 * Vercel's Supabase integration auto-provisions these env vars:
 *   POSTGRES_URL              — pooled connection (pgBouncer, transaction mode)
 *   POSTGRES_URL_NON_POOLING  — direct connection
 *
 * We prefer the non-pooling URL to avoid pgBouncer issues with prepared statements.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let _erpDb: ReturnType<typeof createErpDb> | null = null;
let _erpSql: ReturnType<typeof postgres> | null = null;

function getErpConnectionString(): string {
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
  _erpSql = postgres(getErpConnectionString(), {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return drizzle(_erpSql);
}

/**
 * Drizzle instance for ERP reads (public schema, read-only).
 */
export function getErpDb() {
  if (!_erpDb) {
    _erpDb = createErpDb();
  }
  return _erpDb;
}

/**
 * Raw postgres.js client for ERP introspection queries (admin panel, table discovery).
 */
export function getErpSql() {
  if (!_erpSql) {
    _erpSql = postgres(getErpConnectionString(), {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return _erpSql;
}

/**
 * Returns true if the ERP database env vars are present.
 */
export function isErpConfigured(): boolean {
  return !!(
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL
  );
}

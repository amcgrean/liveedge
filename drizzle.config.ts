import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Use the direct (non-pooled) Supabase connection for migrations.
    // Set BIDS_DATABASE_URL in .env.local to the Supabase direct URL.
    // Never use the pooled pgBouncer URL here — drizzle-kit needs a real connection.
    url: process.env.BIDS_DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING!,
  },
  // Scope all drizzle-kit operations to the `bids` schema only.
  // This prevents touching WH-Tracker's Alembic-managed public schema tables.
  schemaFilter: ['bids'],
  // Only manage UUID-based tables via drizzle-kit.
  // Legacy serial-ID tables (schema-legacy.ts) are NOT in this list —
  // they were migrated manually and must never be touched by drizzle-kit push/generate.
  tablesFilter: [
    'users',
    'customers',
    'bids',
    'bid_versions',
    'products',
    'multipliers',
    'branches',
    'assemblies',
    'assembly_items',
    'takeoff_sessions',
    'takeoff_viewports',
    'takeoff_groups',
    'takeoff_measurements',
    'takeoff_page_states',
  ],
} satisfies Config;

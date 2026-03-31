import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Only manage tables defined in schema.ts (UUID-based).
  // Legacy tables (serial-ID, from Flask/Alembic) are defined in
  // schema-legacy.ts but must NOT be touched by drizzle-kit.
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

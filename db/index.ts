import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// This will throw at runtime if DATABASE_URL is not set.
// That's intentional - we want clear errors during development.
function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
        'Please add your Neon Postgres connection string to .env.local'
    );
  }
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

// Singleton pattern to reuse the connection across requests
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export { schema };

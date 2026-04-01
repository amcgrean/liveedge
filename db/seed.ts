/**
 * Database seed script.
 * Run with: npm run db:seed
 *
 * Creates the initial admin user and populates multipliers from the
 * existing JSON data files so the app works out of the box.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join } from 'path';

const databaseUrl =
  process.env.BIDS_DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error('Set BIDS_DATABASE_URL (or POSTGRES_URL_NON_POOLING / POSTGRES_URL) to run seed.');
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

async function main() {
  console.log('🌱 Seeding database...');

  // ──────────────────────────────────────────
  // 1. Admin user
  // ──────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@beisserlumber.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await db
    .insert(schema.users)
    .values({
      email: adminEmail,
      name: 'Admin',
      role: 'admin',
      passwordHash,
    })
    .onConflictDoNothing();

  console.log(`✅ Admin user: ${adminEmail}`);

  // ──────────────────────────────────────────
  // 2. Branches from JSON
  // ──────────────────────────────────────────
  const branchesRaw = JSON.parse(
    readFileSync(join(process.cwd(), 'public/data/branches.json'), 'utf-8')
  );

  for (const b of branchesRaw) {
    await db
      .insert(schema.branches)
      .values({
        code: b.branch_id,
        name: b.name,
        settings: {
          stud_sku: b.stud_sku,
          stud_sku_9ft: b.stud_sku_9ft,
          stud_sku_10ft: b.stud_sku_10ft,
        },
      })
      .onConflictDoNothing();
  }
  console.log('✅ Branches seeded');

  // ──────────────────────────────────────────
  // 3. Multipliers from JSON
  // ──────────────────────────────────────────
  const multipliersRaw = JSON.parse(
    readFileSync(join(process.cwd(), 'public/data/multipliers.json'), 'utf-8')
  );

  function flattenMultipliers(
    obj: Record<string, unknown>,
    prefix = ''
  ): { key: string; value: number; category: string }[] {
    const results: { key: string; value: number; category: string }[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      const category = prefix.split('.')[0] ?? 'general';
      if (typeof v === 'object' && v !== null && 'value' in v) {
        results.push({
          key: fullKey,
          value: (v as { value: number }).value,
          category,
        });
      } else if (typeof v === 'object' && v !== null) {
        results.push(...flattenMultipliers(v as Record<string, unknown>, fullKey));
      }
    }
    return results;
  }

  const flatMultipliers = flattenMultipliers(multipliersRaw);
  for (const m of flatMultipliers) {
    await db
      .insert(schema.multipliers)
      .values({
        key: m.key,
        value: String(m.value),
        category: m.category,
        description: m.key.replace(/[._]/g, ' '),
      })
      .onConflictDoNothing();
  }
  console.log(`✅ ${flatMultipliers.length} multipliers seeded`);

  // ──────────────────────────────────────────
  // 4. Customers from CSV
  // ──────────────────────────────────────────
  const Papa = await import('papaparse');
  const csvRaw = readFileSync(
    join(process.cwd(), 'public/data/customers.csv'),
    'utf-8'
  );
  const { data: csvData } = Papa.default.parse<{ name: string; code: string }>(
    csvRaw,
    { header: true, skipEmptyLines: true }
  );

  for (const row of csvData) {
    if (!row.name) continue;
    await db
      .insert(schema.customers)
      .values({
        code: row.code ?? null,
        name: row.name,
      })
      .onConflictDoNothing();
  }
  console.log(`✅ ${csvData.length} customers seeded from CSV`);

  console.log('');
  console.log('🎉 Seed complete!');
  console.log('');
  console.log(`Admin login:`);
  console.log(`  Email:    ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
  console.log('');
  console.log('⚠️  Change the admin password immediately after first login!');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

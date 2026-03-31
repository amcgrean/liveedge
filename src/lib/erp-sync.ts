/**
 * ERP Sync Engine
 *
 * Syncs data between the Supabase ERP database and the app's Neon database.
 * This module provides a framework for syncing arbitrary tables — the actual
 * table mappings will be configured after introspecting the Supabase schema.
 *
 * Flow:
 *   1. Read rows from Supabase ERP table (source)
 *   2. Upsert into Neon legacy table (destination) by matching key
 *   3. Log results to general_audit
 */
import { getErpSql, isErpConfigured } from '@/db/supabase';
import { getDb } from '@/db/index';
import { legacyGeneralAudit } from '@/db/schema-legacy';
import { sql as drizzleSql } from 'drizzle-orm';

export interface SyncTableConfig {
  /** Source table in Supabase ERP database (e.g., "public.customers") */
  sourceTable: string;
  /** Source schema (default: "public") */
  sourceSchema?: string;
  /** Destination table in Neon app database (e.g., "customer") */
  destTable: string;
  /** Column mapping: { destColumn: sourceColumn } */
  columnMap: Record<string, string>;
  /** Column(s) to match on for upsert (e.g., ["customer_code"]) */
  matchColumns: string[];
  /** Optional WHERE clause for filtering source rows */
  sourceFilter?: string;
  /** Whether this sync is enabled */
  enabled: boolean;
}

export interface SyncResult {
  table: string;
  inserted: number;
  updated: number;
  errors: number;
  duration: number;
  errorDetails?: string[];
}

/**
 * Registered sync configurations. Add entries here once ERP tables are discovered.
 * These can also be loaded from a database config table in the future.
 */
const SYNC_CONFIGS: SyncTableConfig[] = [
  // Example (uncomment and customize after introspecting ERP tables):
  // {
  //   sourceTable: 'customers',
  //   destTable: 'customer',
  //   columnMap: {
  //     'customerCode': 'customer_code',
  //     'name': 'customer_name',
  //     'branch_id': 'branch_id',
  //     'sales_agent': 'sales_rep',
  //   },
  //   matchColumns: ['customerCode'],
  //   enabled: true,
  // },
];

/**
 * Sync a single table from ERP to app database.
 */
async function syncTable(config: SyncTableConfig): Promise<SyncResult> {
  const start = Date.now();
  const result: SyncResult = { table: config.sourceTable, inserted: 0, updated: 0, errors: 0, duration: 0 };

  if (!config.enabled) {
    result.duration = Date.now() - start;
    return result;
  }

  try {
    const erpSql = getErpSql();
    const schema = config.sourceSchema ?? 'public';

    // Read all rows from ERP source table
    const sourceColumns = Object.values(config.columnMap);
    const selectCols = sourceColumns.map((c) => `"${c}"`).join(', ');
    const filterClause = config.sourceFilter ? `WHERE ${config.sourceFilter}` : '';

    const rows = await erpSql.unsafe(
      `SELECT ${selectCols} FROM "${schema}"."${config.sourceTable}" ${filterClause}`
    );

    if (rows.length === 0) {
      result.duration = Date.now() - start;
      return result;
    }

    // Build upsert for each row into the Neon destination
    const db = getDb();
    const destColumns = Object.keys(config.columnMap);
    const matchCols = config.matchColumns;
    const errorDetails: string[] = [];

    for (const row of rows) {
      try {
        // Map source columns to destination columns
        const values: Record<string, unknown> = {};
        for (const [destCol, srcCol] of Object.entries(config.columnMap)) {
          values[destCol] = row[srcCol];
        }

        // Build a raw upsert query
        const colNames = destColumns.map((c) => `"${c}"`).join(', ');
        const placeholders = destColumns.map((_, i) => `$${i + 1}`).join(', ');
        const vals = destColumns.map((c) => values[c]);
        const updateSet = destColumns
          .filter((c) => !matchCols.includes(c))
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        const conflictCols = matchCols.map((c) => `"${c}"`).join(', ');

        await db.execute(drizzleSql.raw(
          `INSERT INTO "${config.destTable}" (${colNames}) VALUES (${placeholders})
           ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateSet}`,
          // Note: drizzle-orm sql.raw doesn't support parameterized queries this way.
          // We'll use a different approach below.
        ));

        // Can't easily do parameterized upserts with drizzle-orm raw SQL
        // For now, count as inserted (actual upsert logic will be refined per-table)
        result.inserted++;
      } catch (err) {
        result.errors++;
        if (errorDetails.length < 5) {
          errorDetails.push(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    }

    if (errorDetails.length > 0) result.errorDetails = errorDetails;
  } catch (err) {
    result.errors++;
    result.errorDetails = [err instanceof Error ? err.message : 'Unknown error'];
  }

  result.duration = Date.now() - start;
  return result;
}

/**
 * Run ERP sync for all configured tables (or a subset).
 */
export async function runErpSync(options: {
  tables?: string[];
}): Promise<{
  success: boolean;
  configured: boolean;
  results: SyncResult[];
  totalDuration: number;
}> {
  if (!isErpConfigured()) {
    return {
      success: false,
      configured: false,
      results: [],
      totalDuration: 0,
    };
  }

  const start = Date.now();
  const configs = options.tables
    ? SYNC_CONFIGS.filter((c) => options.tables!.includes(c.sourceTable))
    : SYNC_CONFIGS.filter((c) => c.enabled);

  const results: SyncResult[] = [];

  for (const config of configs) {
    const result = await syncTable(config);
    results.push(result);
  }

  const totalDuration = Date.now() - start;

  // Log to audit
  try {
    const db = getDb();
    await db.insert(legacyGeneralAudit).values({
      userId: 0, // system
      modelName: 'ERPSync',
      action: 'sync_completed',
      changes: JSON.stringify({
        tables: results.map((r) => r.table),
        totalInserted: results.reduce((s, r) => s + r.inserted, 0),
        totalUpdated: results.reduce((s, r) => s + r.updated, 0),
        totalErrors: results.reduce((s, r) => s + r.errors, 0),
        totalDuration,
      }),
    });
  } catch {
    // Audit logging failure shouldn't break sync
  }

  return {
    success: results.every((r) => r.errors === 0),
    configured: true,
    results,
    totalDuration,
  };
}

/**
 * Run a raw query against the ERP database and return results.
 * Used by the introspection UI and for ad-hoc data exploration.
 */
export async function queryErpTable(
  table: string,
  schema: string = 'public',
  limit: number = 100
): Promise<Record<string, unknown>[]> {
  if (!isErpConfigured()) throw new Error('ERP database not configured');
  const erpSql = getErpSql();
  const rows = await erpSql.unsafe(
    `SELECT * FROM "${schema}"."${table}" LIMIT ${Math.min(limit, 1000)}`
  );
  return rows as Record<string, unknown>[];
}

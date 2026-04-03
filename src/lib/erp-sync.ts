/**
 * ERP Sync Engine
 *
 * Syncs customer data from the Supabase agility_customers table into the app database.
 * For large tables (items, ship-to, PO/SO), we query Supabase directly via
 * dedicated API endpoints instead of syncing.
 *
 * Sync: agility_customers → customer (by cust_code)
 * Read-only: agility_items, agility_customers (ship-to rows)
 */
import { getErpSql, isErpConfigured } from '@/db/supabase';
import { getDb } from '@/db/index';
import { legacyCustomer, legacyGeneralAudit } from '@/db/schema-legacy';
import { eq } from 'drizzle-orm';

export interface SyncResult {
  table: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  duration: number;
  errorDetails?: string[];
}

/**
 * Sync customers from agility_customers into the app customer table.
 * Uses cust_code as the unique match key.
 */
async function syncCustomers(): Promise<SyncResult> {
  const start = Date.now();
  const result: SyncResult = {
    table: 'agility_customers',
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    duration: 0,
  };
  const errorDetails: string[] = [];

  try {
    const erpSql = getErpSql();
    const db = getDb();

    // Read active customers from ERP (one row per customer via GROUP BY)
    const erpCustomers = await erpSql`
      SELECT cust_code, MAX(cust_name) AS cust_name, MAX(branch_code) AS branch_code,
             MAX(cust_phone) AS phone, MAX(cust_email) AS email
      FROM public.agility_customers
      WHERE is_deleted = false
      GROUP BY cust_code
      ORDER BY cust_code
    `;

    if (erpCustomers.length === 0) {
      result.duration = Date.now() - start;
      return result;
    }

    // Get all existing customers from Neon for fast lookup
    const existing = await db
      .select({ id: legacyCustomer.id, customerCode: legacyCustomer.customerCode })
      .from(legacyCustomer);
    const existingMap = new Map(existing.map((c) => [c.customerCode, c.id]));

    for (const erp of erpCustomers) {
      const custCode = (erp.cust_code as string)?.trim();
      const custName = (erp.cust_name as string)?.trim();

      if (!custCode || !custName) {
        result.skipped++;
        continue;
      }

      try {
        const existingId = existingMap.get(custCode);

        if (existingId) {
          // Update existing customer
          await db
            .update(legacyCustomer)
            .set({
              name: custName,
              salesAgent: (erp.email as string) ?? null,
            })
            .where(eq(legacyCustomer.id, existingId));
          result.updated++;
        } else {
          // Insert new customer
          await db.insert(legacyCustomer).values({
            customerCode: custCode,
            name: custName,
            salesAgent: (erp.email as string) ?? null,
          });
          result.inserted++;
        }
      } catch (err) {
        result.errors++;
        if (errorDetails.length < 10) {
          errorDetails.push(`${custCode}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }
  } catch (err) {
    result.errors++;
    errorDetails.push(err instanceof Error ? err.message : 'Unknown error');
  }

  if (errorDetails.length > 0) result.errorDetails = errorDetails;
  result.duration = Date.now() - start;
  return result;
}

/**
 * Run ERP sync for all configured syncs (or a subset).
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
    return { success: false, configured: false, results: [], totalDuration: 0 };
  }

  const start = Date.now();
  const results: SyncResult[] = [];

  // Run customer sync
  if (!options.tables || options.tables.includes('agility_customers')) {
    results.push(await syncCustomers());
  }

  const totalDuration = Date.now() - start;

  // Log to audit
  try {
    const db = getDb();
    await db.insert(legacyGeneralAudit).values({
      userId: 0,
      modelName: 'ERPSync',
      action: 'sync_completed',
      changes: JSON.stringify({
        tables: results.map((r) => r.table),
        totalInserted: results.reduce((s, r) => s + r.inserted, 0),
        totalUpdated: results.reduce((s, r) => s + r.updated, 0),
        totalSkipped: results.reduce((s, r) => s + r.skipped, 0),
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

// ============================================================
// Read-only ERP queries (query Supabase directly, no sync)
// ============================================================

/** Search ERP items with optional branch filter */
export async function searchErpItems(options: {
  q?: string;
  branchCode?: string;
  stockOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const erpSql = getErpSql();
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;

  let whereClause = 'WHERE is_deleted = false';
  const params: unknown[] = [];
  let paramIdx = 0;

  if (options.branchCode) {
    paramIdx++;
    whereClause += ` AND system_id = $${paramIdx}`;
    params.push(options.branchCode);
  }

  if (options.stockOnly) {
    whereClause += ' AND stock = true';
  }

  if (options.q) {
    paramIdx++;
    whereClause += ` AND (item ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR short_des ILIKE $${paramIdx})`;
    params.push(`%${options.q}%`);
  }

  const countResult = await erpSql.unsafe(
    `SELECT count(*)::int as total
     FROM public.agility_items
     ${whereClause}`,
    params as never[]
  );

  const rows = await erpSql.unsafe(
    `SELECT
       item, description, short_des, size_, type, stocking_uom,
       ext_description, link_product_group,
       active_flag, stock, display_uom, picking_uom,
       weight, weight_uom, contentcode, discontinued_item
     FROM public.agility_items
     ${whereClause}
     ORDER BY item
     LIMIT ${limit} OFFSET ${offset}`,
    params as never[]
  );

  return {
    items: rows as Record<string, unknown>[],
    total: (countResult[0]?.total as number) ?? 0,
  };
}

/** Get ship-to addresses for a customer */
export async function getCustomerShipTos(custCode: string): Promise<Record<string, unknown>[]> {
  const erpSql = getErpSql();
  const rows = await erpSql`
    SELECT
      seq_num, shipto_name, address_1, address_2, address_3,
      city, state, zip, shipto_phone AS phone, branch_code, lat, lon
    FROM public.agility_customers
    WHERE cust_code = ${custCode} AND is_deleted = false
    ORDER BY seq_num
  `;
  return rows as Record<string, unknown>[];
}

/** Get ERP customer detail by code */
export async function getErpCustomer(custCode: string): Promise<Record<string, unknown> | null> {
  const erpSql = getErpSql();
  const rows = await erpSql`
    SELECT DISTINCT ON (cust_code)
      cust_code, cust_name, cust_phone AS phone, cust_email AS email,
      balance, credit_limit, cust_type, branch_code
    FROM public.agility_customers
    WHERE cust_code = ${custCode} AND is_deleted = false
    ORDER BY cust_code, seq_num NULLS LAST
    LIMIT 1
  `;
  return (rows[0] as Record<string, unknown>) ?? null;
}

/**
 * Run a raw query against the ERP database and return results.
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

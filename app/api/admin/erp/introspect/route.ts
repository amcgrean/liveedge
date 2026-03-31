import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql, isErpConfigured } from '../../../../../db/supabase';

/**
 * GET /api/admin/erp/introspect
 *
 * Discovers all tables and columns in the Supabase ERP database.
 * Admin-only. Returns table names, column names, types, and row counts.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!isErpConfigured()) {
    return NextResponse.json({
      error: 'ERP database not configured',
      hint: 'Connect Supabase to your Vercel project. Expected env vars: POSTGRES_URL or POSTGRES_URL_NON_POOLING.',
    }, { status: 503 });
  }

  try {
    const sql = getErpSql();

    // Get all user tables (exclude system schemas)
    const tables = await sql`
      SELECT
        t.table_schema,
        t.table_name,
        (
          SELECT count(*)::int
          FROM information_schema.columns c
          WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
        ) as column_count
      FROM information_schema.tables t
      WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog', 'auth', 'storage', 'realtime', 'supabase_functions', 'supabase_migrations', 'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'pgsodium', 'pgsodium_masks', 'vault', '_realtime', 'net', '_analytics')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_schema, t.table_name
    `;

    // Get columns for each table
    const columns = await sql`
      SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.ordinal_position
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog', 'auth', 'storage', 'realtime', 'supabase_functions', 'supabase_migrations', 'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'pgsodium', 'pgsodium_masks', 'vault', '_realtime', 'net', '_analytics')
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
    `;

    // Get approximate row counts
    const rowCounts = await sql`
      SELECT
        schemaname as table_schema,
        relname as table_name,
        n_live_tup::int as row_count
      FROM pg_stat_user_tables
      WHERE schemaname NOT IN ('auth', 'storage', 'realtime', 'supabase_functions', 'extensions')
      ORDER BY schemaname, relname
    `;

    // Group columns by table
    const tableMap: Record<string, {
      schema: string;
      name: string;
      columnCount: number;
      rowCount: number;
      columns: { name: string; type: string; nullable: boolean; default: string | null; maxLength: number | null }[];
    }> = {};

    for (const t of tables) {
      const key = `${t.table_schema}.${t.table_name}`;
      const rc = rowCounts.find((r: Record<string, unknown>) => r.table_schema === t.table_schema && r.table_name === t.table_name);
      tableMap[key] = {
        schema: t.table_schema as string,
        name: t.table_name as string,
        columnCount: t.column_count as number,
        rowCount: (rc?.row_count as number) ?? 0,
        columns: [],
      };
    }

    for (const c of columns) {
      const key = `${c.table_schema}.${c.table_name}`;
      if (tableMap[key]) {
        tableMap[key].columns.push({
          name: c.column_name as string,
          type: c.data_type as string,
          nullable: c.is_nullable === 'YES',
          default: c.column_default as string | null,
          maxLength: c.character_maximum_length as number | null,
        });
      }
    }

    return NextResponse.json({
      configured: true,
      tableCount: tables.length,
      tables: Object.values(tableMap),
    });
  } catch (err) {
    console.error('[erp/introspect]', err);
    return NextResponse.json({
      error: 'Failed to introspect ERP database',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

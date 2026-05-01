import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { queryErpTable } from '../../../../../src/lib/erp-sync';
import { isErpConfigured } from '../../../../../db/supabase';

/**
 * GET /api/admin/erp/query?table=customers&schema=public&limit=50
 *
 * Preview rows from an ERP table. Admin-only.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  if (!isErpConfigured()) {
    return NextResponse.json({ error: 'ERP database not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const table = searchParams.get('table');
  const schema = searchParams.get('schema') ?? 'public';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  if (!table) return NextResponse.json({ error: 'table param is required' }, { status: 400 });

  // Basic SQL injection prevention — table/schema names must be alphanumeric + underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    return NextResponse.json({ error: 'Invalid table or schema name' }, { status: 400 });
  }

  try {
    const rows = await queryErpTable(table, schema, limit);
    return NextResponse.json({ table, schema, rowCount: rows.length, rows });
  } catch (err) {
    console.error('[erp/query]', err);
    return NextResponse.json({
      error: 'Query failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

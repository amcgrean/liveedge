import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { agilityApi, isAgilityConfigured, AgilityApiError } from '../../../../../../src/lib/agility-api';
import { getErpSql } from '../../../../../../db/supabase';

/**
 * GET /api/sales/customers/:code/ar-live
 *
 * Returns live AR balance and open invoices from Agility for a customer.
 * Falls back to the agility_ar_open mirror table if API is not configured.
 *
 * Query params:
 *   branch  — branch code for the API session (required for live data)
 */

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code: custCode } = await context.params;
  if (!custCode) return NextResponse.json({ error: 'Customer code required' }, { status: 400 });

  const branchCode = req.nextUrl.searchParams.get('branch') ?? '';

  // ── Mirror table fallback (always available) ──────────────────────────────
  const sql = getErpSql();

  type ArRow = {
    cust_key: string | null;
    ref_num: string | null;
    open_amt: number | null;
    open_flag: string | null;
    due_date: string | null;
    invoice_date: string | null;
    tran_type: string | null;
  };

  const mirrorRows = await sql<ArRow[]>`
    SELECT cust_key, ref_num, open_amt, open_flag, due_date::text, invoice_date::text, tran_type
    FROM agility_ar_open
    WHERE cust_key = ${custCode}
      AND open_flag = 'Y'
    ORDER BY due_date NULLS LAST
    LIMIT 100
  `.catch(() => [] as ArRow[]);

  const mirrorBalance = mirrorRows.reduce((sum, r) => sum + Number(r.open_amt ?? 0), 0);
  const overdueRows   = mirrorRows.filter(
    (r) => r.due_date && new Date(r.due_date) < new Date()
  );
  const overdueBalance = overdueRows.reduce((sum, r) => sum + Number(r.open_amt ?? 0), 0);

  const mirrorData = {
    source:         'mirror' as const,
    customerCode:   custCode,
    openBalance:    mirrorBalance,
    overdueBalance,
    openInvoices:   mirrorRows.length,
    overdueInvoices: overdueRows.length,
    invoices:       mirrorRows,
  };

  // ── Live API data ────────────────────────────────────────────────────────
  if (!isAgilityConfigured() || !branchCode) {
    return NextResponse.json({
      ...mirrorData,
      liveData: null,
      note: 'Mirror table data — set branch param for live API data',
    });
  }

  try {
    const liveRaw = await agilityApi.customerOpenActivity(custCode, { branch: branchCode });

    return NextResponse.json({
      ...mirrorData,
      source:   'live+mirror' as const,
      liveData: liveRaw,
    });
  } catch (err) {
    const errMsg = err instanceof AgilityApiError ? err.message : 'Live API unavailable';
    console.warn(`[ar-live/${custCode}] Fallback:`, errMsg);

    return NextResponse.json({
      ...mirrorData,
      liveData:  null,
      liveError: errMsg,
    });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../src/lib/access-control';
import { getErpSql } from '../../../db/supabase';

export interface SearchResult {
  type: 'so' | 'customer' | 'work_order' | 'picker' | 'item';
  title: string;
  subtitle: string;
  url: string;
  meta?: string;
}

// GET /api/search?q=<query>
// Cross-searches SOs, customers, work orders, and pickers.
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('sales.view', 'yard.view', 'dispatch.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const isAdmin = hasCapability(session, 'branch.all');

  const userBranch = session.user.branch ?? null;
  const branchFilter = isAdmin ? null : userBranch;

  try {
    const sql = getErpSql();
    const results: SearchResult[] = [];
    const pct = `%${q}%`;
    const isNumeric = /^\d+$/.test(q);

    // ── Sales Orders ──────────────────────────────────────────────────────
    type SoRow = {
      so_id: string;
      cust_name: string | null;
      so_status: string | null;
      system_id: string;
      expect_date: string | null;
    };
    const soRows = await sql<SoRow[]>`
      SELECT soh.so_id, soh.cust_name, soh.so_status, soh.system_id,
             soh.expect_date::text AS expect_date
      FROM agility_so_header soh
      WHERE soh.is_deleted = false
        ${branchFilter ? sql`AND soh.system_id = ${branchFilter}` : sql``}
        AND (
          soh.so_id ILIKE ${pct}
          OR soh.cust_name ILIKE ${pct}
          OR soh.reference ILIKE ${pct}
        )
      ORDER BY soh.so_id DESC
      LIMIT 8
    `;

    const STATUS_LABELS: Record<string, string> = {
      K: 'Pick Printed', P: 'Picked', S: 'Staged', I: 'Invoiced', C: 'Closed',
    };

    for (const r of soRows) {
      const statusLabel = STATUS_LABELS[r.so_status?.toUpperCase() ?? ''] ?? r.so_status ?? '';
      results.push({
        type: 'so',
        title: `SO #${r.so_id}`,
        subtitle: r.cust_name ?? 'Unknown customer',
        url: `/sales/orders/${r.so_id}`,
        meta: [statusLabel, r.system_id, r.expect_date ? new Date(r.expect_date).toLocaleDateString() : null]
          .filter(Boolean).join(' · '),
      });
    }

    // ── Customers ─────────────────────────────────────────────────────────
    type CustRow = {
      cust_code: string;
      cust_name: string | null;
      system_id: string;
      city: string | null;
      state: string | null;
    };
    const custRows = await sql<CustRow[]>`
      SELECT DISTINCT ON (cust_code)
        cust_code, cust_name, system_id,
        shipto_city AS city, shipto_state AS state
      FROM agility_customers
      WHERE is_deleted = false
        ${branchFilter ? sql`AND system_id = ${branchFilter}` : sql``}
        AND (
          cust_code ILIKE ${pct}
          OR cust_name ILIKE ${pct}
        )
      ORDER BY cust_code, seq_num
      LIMIT 5
    `;

    for (const r of custRows) {
      const location = [r.city, r.state].filter(Boolean).join(', ');
      results.push({
        type: 'customer',
        title: r.cust_name ?? r.cust_code,
        subtitle: `Code: ${r.cust_code}${location ? ` · ${location}` : ''}`,
        url: `/sales/customers/${r.cust_code}`,
        meta: r.system_id,
      });
    }

    // ── Work Orders ────────────────────────────────────────────────────────
    type WoRow = {
      wo_id: string;
      source_id: string | null;
      description: string | null;
      status: string | null;
      system_id: string;
    };
    const woRows = await sql<WoRow[]>`
      SELECT wo_id::text AS wo_id, source_id::text AS source_id,
             description, status, system_id
      FROM agility_wo_header
      WHERE is_deleted = false
        ${branchFilter ? sql`AND system_id = ${branchFilter}` : sql``}
        AND UPPER(COALESCE(status, '')) != 'C'
        AND (
          wo_id::text ILIKE ${pct}
          OR source_id::text ILIKE ${pct}
          OR description ILIKE ${pct}
        )
      ORDER BY wo_id DESC
      LIMIT 5
    `;

    for (const r of woRows) {
      results.push({
        type: 'work_order',
        title: `WO #${r.wo_id}`,
        subtitle: r.description ?? 'Work order',
        url: `/work-orders`,
        meta: [r.status, r.source_id ? `SO #${r.source_id}` : null, r.system_id]
          .filter(Boolean).join(' · '),
      });
    }

    // ── Pickers ────────────────────────────────────────────────────────────
    type PickerRow = {
      id: number;
      name: string;
      barcode: string | null;
      system_id: string | null;
      is_active: boolean;
    };
    const pickerRows = await sql<PickerRow[]>`
      SELECT id, name, barcode, system_id, is_active
      FROM public.pickster
      WHERE (
        name ILIKE ${pct}
        ${isNumeric ? sql`OR barcode = ${q}` : sql``}
      )
      ORDER BY name
      LIMIT 5
    `;

    for (const r of pickerRows) {
      results.push({
        type: 'picker',
        title: r.name,
        subtitle: r.barcode ? `Barcode: ${r.barcode}` : 'Picker',
        url: `/warehouse/pickers/${r.id}`,
        meta: [r.system_id, r.is_active ? null : 'Inactive'].filter(Boolean).join(' · '),
      });
    }

    // ── Items ─────────────────────────────────────────────────────────────
    type ItemRow = {
      item_code: string;
      description: string | null;
      product_major: string | null;
    };
    const itemRows = await sql<ItemRow[]>`
      SELECT ai.item AS item_code, ai.description, ai.product_major
      FROM agility_items ai
      WHERE ai.is_deleted = false
        AND (
          ai.item ILIKE ${pct}
          OR ai.description ILIKE ${pct}
        )
        AND EXISTS (
          SELECT 1 FROM agility_item_branch aib
          WHERE aib.item_code = ai.item
            AND aib.is_deleted = false
            AND aib.active_flag = true
            ${branchFilter ? sql`AND aib.system_id = ${branchFilter}` : sql``}
        )
      ORDER BY ai.item
      LIMIT 5
    `;

    for (const r of itemRows) {
      results.push({
        type: 'item',
        title: r.item_code,
        subtitle: r.description ?? 'Item',
        url: `/sales/products?q=${encodeURIComponent(r.item_code)}`,
        meta: r.product_major ?? undefined,
      });
    }

    return NextResponse.json({ results, query: q });
  } catch (err) {
    console.error('[search GET]', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

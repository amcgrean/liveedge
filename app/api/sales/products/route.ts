import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';
import { getSelectedBranchCode } from '@/lib/branch-context';
import {
  addParam,
  buildBranchJoinOn,
  buildIlikeClause,
  buildItemSelect,
  buildSearchVector,
  getAgilityItemColumns,
  isProductAdmin,
  parseIncludeInactive,
} from './_shared';

type ProductRow = {
  item_number: string;
  description: string | null;
  short_description: string | null;
  extended_description: string | null;
  size: string | null;
  type: string | null;
  stocking_uom: string | null;
  handling_code: string | null;
  qty_on_hand: number | null;
  default_location: string | null;
  primary_supplier: string | null;
  system_id: string | null;
  active_flag: boolean | null;
  stock: boolean | null;
};

type CountRow = { total: number };
type SearchMode = 'fts' | 'ilike' | null;

// GET /api/sales/products?q=&group=<major_code>&major=<minor_code>&limit=50&offset=0
// Branch is read from the nav cookie (beisser-branch) for admins, session for non-admins.
// Item master comes from agility_items (ai); stock/branch data from agility_item_branch (bi).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q')?.trim() ?? '';
  const majorCode = searchParams.get('group')?.trim() ?? '';
  const minorCode = searchParams.get('major')?.trim() ?? '';
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  const isAdmin = isProductAdmin(session.user);
  const includeInactive = isAdmin && parseIncludeInactive(searchParams.get('includeInactive'));
  const effectiveBranch = isAdmin
    ? (await getSelectedBranchCode() ?? '')
    : (session.user.branch ?? '');

  // minorCode is NOT globally unique — the same code appears in multiple majors.
  // Always require majorCode when minorCode is provided.
  if (minorCode && !majorCode) {
    return NextResponse.json({ products: [], total: 0 });
  }

  const hasBrowseFilter = Boolean(majorCode);
  if (!hasBrowseFilter && q.length < 2) {
    return NextResponse.json({ products: [], total: 0 });
  }

  try {
    const sql = getErpSql();
    const columns = await getAgilityItemColumns(sql);

    // Branch param is $1 in the JOIN ON clause (added first so it's always $1 or absent).
    const baseParams: unknown[] = [];
    const branchPlaceholder = effectiveBranch ? addParam(baseParams, effectiveBranch) : '';
    const joinOn = buildBranchJoinOn(branchPlaceholder, includeInactive);

    // WHERE conditions on ai.* (agility_items columns).
    // Always filter by both major AND minor together — minor codes repeat across majors.
    const baseWhere: string[] = [];
    if (majorCode) baseWhere.push(`ai.product_major_code = ${addParam(baseParams, majorCode)}`);
    if (majorCode && minorCode) baseWhere.push(`ai.product_minor_code = ${addParam(baseParams, minorCode)}`);

    const fromSql = `FROM public.agility_items ai JOIN public.agility_item_branch bi ON ${joinOn}`;

    const runQuery = async (mode: SearchMode) => {
      const qParams = [...baseParams];
      const qWhere = [...baseWhere];

      if (q.length >= 2 && mode === 'fts') {
        qWhere.push(`${buildSearchVector(columns, 'ai')} @@ websearch_to_tsquery('english', ${addParam(qParams, q)})`);
      } else if (q.length >= 2 && mode === 'ilike') {
        qWhere.push(buildIlikeClause(columns, addParam(qParams, `%${q}%`), 'ai'));
      }

      const whereSql = qWhere.length > 0 ? `WHERE ${qWhere.join(' AND ')}` : '';

      const [countRows, rows] = await Promise.all([
        sql.unsafe(
          `SELECT count(*)::int AS total ${fromSql} ${whereSql}`,
          qParams as never[]
        ) as Promise<CountRow[]>,
        sql.unsafe(
          `${buildItemSelect(columns)} ${fromSql} ${whereSql} ORDER BY ai.item, bi.system_id LIMIT ${limit} OFFSET ${offset}`,
          qParams as never[]
        ) as Promise<ProductRow[]>,
      ]);

      return { products: rows, total: countRows[0]?.total ?? 0 };
    };

    let result = await runQuery(q.length >= 2 ? 'fts' : null);
    if (q.length >= 2 && result.total === 0) {
      result = await runQuery('ilike');
    }

    return NextResponse.json({ products: result.products, total: result.total });
  } catch (err) {
    console.error('[sales/products GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

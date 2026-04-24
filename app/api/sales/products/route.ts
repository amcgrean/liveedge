import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';
import {
  addParam,
  appendBaseProductFilters,
  buildIlikeClause,
  buildSearchVector,
  getAgilityItemColumns,
  getGroupColumn,
  getProductCapabilities,
  isProductAdmin,
  parseGroupSource,
  parseIncludeInactive,
  resolveGroupSource,
  type GroupSource,
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
  product_group: string | null;
  product_major: string | null;
  product_minor: string | null;
  system_id: string | null;
  active_flag: boolean | null;
  stock: boolean | null;
};

type CountRow = {
  total: number;
};

type QueryOptions = {
  branch: string;
  includeInactive: boolean;
  group: string;
  groupSource: GroupSource | null;
  major: string;
  minor: string;
  q: string;
  limit: number;
  offset: number;
};

type SearchMode = 'fts' | 'ilike' | null;

// GET /api/sales/products?q=&group=&branch=&limit=50&offset=0
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q')?.trim() ?? '';
  const group = searchParams.get('group')?.trim() ?? '';
  const major = searchParams.get('major')?.trim() ?? '';
  const minor = searchParams.get('minor')?.trim() ?? '';
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  const isAdmin = isProductAdmin(session.user);
  const includeInactive = isAdmin && parseIncludeInactive(searchParams.get('includeInactive'));
  const effectiveBranch = isAdmin
    ? (searchParams.get('branch')?.trim() ?? '')
    : (session.user.branch ?? '');

  const hasBrowseFilter = Boolean(group || major || minor);
  if (!hasBrowseFilter && q.length < 2) {
    return NextResponse.json({ products: [], total: 0 });
  }

  try {
    const sql = getErpSql();
    const columns = await getAgilityItemColumns(sql);
    const parsedGroupSource = parseGroupSource(searchParams.get('groupSource'));
    const groupSource = group
      ? parsedGroupSource ?? (await resolveGroupSource(sql, effectiveBranch, includeInactive))
      : null;

    const options: QueryOptions = {
      branch: effectiveBranch,
      includeInactive,
      group,
      groupSource,
      major,
      minor,
      q,
      limit,
      offset,
    };

    const searchMode: SearchMode = q.length >= 2 ? 'fts' : null;
    let result = await queryProducts(sql, columns, options, searchMode);

    if (searchMode === 'fts' && result.total === 0) {
      result = await queryProducts(sql, columns, options, 'ilike');
    }

    return NextResponse.json({
      products: result.products,
      total: result.total,
    });
  } catch (err) {
    console.error('[sales/products GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function queryProducts(
  sql: ReturnType<typeof getErpSql>,
  columns: Set<string>,
  options: QueryOptions,
  searchMode: SearchMode
): Promise<{ products: ProductRow[]; total: number }> {
  const params: unknown[] = [];
  const where: string[] = [];
  const capabilities = getProductCapabilities(columns);

  appendBaseProductFilters(where, params, options.branch, options.includeInactive);

  if (options.group) {
    where.push(`${getGroupColumn(options.groupSource ?? 'link_product_group')} = ${addParam(params, options.group)}`);
  }

  if (options.major) {
    if (columns.has('product_major_code')) {
      where.push(`product_major_code = ${addParam(params, options.major)}`);
    } else {
      where.push('false');
    }
  }

  if (options.minor) {
    if (columns.has('product_minor_code')) {
      where.push(`product_minor_code = ${addParam(params, options.minor)}`);
    } else {
      where.push('false');
    }
  }

  if (options.q.length >= 2 && searchMode === 'fts') {
    where.push(`${buildSearchVector(columns)} @@ websearch_to_tsquery('english', ${addParam(params, options.q)})`);
  } else if (options.q.length >= 2 && searchMode === 'ilike') {
    where.push(buildIlikeClause(columns, addParam(params, `%${options.q}%`)));
  }

  const whereSql = where.join(' AND ');
  const countRows = (await sql.unsafe(
    `SELECT count(*)::int AS total
     FROM public.agility_items
     WHERE ${whereSql}`,
    params as never[]
  )) as CountRow[];
  const total = countRows[0]?.total ?? 0;

  if (total === 0) {
    return { products: [], total };
  }

  // TODO: cost from Agility API when pricing data is exposed.
  const rows = (await sql.unsafe(
    `${buildProductSelect(capabilities)}
     FROM public.agility_items
     WHERE ${whereSql}
     ORDER BY item, system_id
     LIMIT ${options.limit}
     OFFSET ${options.offset}`,
    params as never[]
  )) as ProductRow[];

  return { products: rows, total };
}

function buildProductSelect(capabilities: ReturnType<typeof getProductCapabilities>): string {
  return `SELECT
    item AS item_number,
    description,
    short_des AS short_description,
    ext_description AS extended_description,
    size_ AS size,
    type,
    stocking_uom,
    handling_code,
    qty_on_hand::float8 AS qty_on_hand,
    default_location,
    ${capabilities.hasPrimarySupplier ? 'primary_supplier' : 'NULL::text'} AS primary_supplier,
    link_product_group AS product_group,
    ${capabilities.hasMajor ? 'product_major' : 'NULL::text'} AS product_major,
    ${capabilities.hasMinor ? 'product_minor' : 'NULL::text'} AS product_minor,
    system_id,
    active_flag,
    stock`;
}

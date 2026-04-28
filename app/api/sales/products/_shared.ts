import { getErpSql } from '../../../../db/supabase';

export type ErpSql = ReturnType<typeof getErpSql>;

type ColumnRow = {
  column_name: string;
};

// Columns that live on agility_items (master) — used for FTS/ILIKE search
const SEARCH_COLUMNS = [
  'item',
  'description',
  'ext_description',
  'short_des',
  'type',
  'stocking_uom',
] as const;

let columnCache: Set<string> | null = null;

export async function getAgilityItemColumns(sql: ErpSql): Promise<Set<string>> {
  if (columnCache) return columnCache;
  const rows = (await sql.unsafe(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'agility_items'`
  )) as ColumnRow[];
  columnCache = new Set(rows.map((r) => r.column_name));
  return columnCache;
}

export function parseIncludeInactive(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

export function isProductAdmin(user: { role?: string | null; roles?: string[] | null }): boolean {
  return (
    user.role === 'admin' ||
    (user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r))
  );
}

export function addParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

/**
 * Appends a WHERE condition that scopes agility_items to items present in
 * agility_item_branch for the given branch/status combination.
 * Used by tile queries (groups, majors) which only SELECT from agility_items.
 */
export function appendBranchItemFilter(
  where: string[],
  params: unknown[],
  branch: string,
  includeInactive: boolean,
) {
  const sub = ['is_deleted = false'];
  if (!includeInactive) {
    sub.push('active_flag = true');
    sub.push('stock = true');
  }
  if (branch) sub.push(`system_id = ${addParam(params, branch)}`);
  where.push(
    `item IN (SELECT item_code FROM public.agility_item_branch WHERE ${sub.join(' AND ')})`
  );
}

/**
 * Builds the JOIN ON fragment for agility_item_branch (aliased as bi).
 * The branch param placeholder ($N) should already be added to params before calling.
 */
export function buildBranchJoinOn(branchPlaceholder: string, includeInactive: boolean): string {
  const conditions = ['bi.item_code = ai.item', 'bi.is_deleted = false'];
  if (!includeInactive) {
    conditions.push('bi.active_flag = true');
    conditions.push('bi.stock = true');
  }
  if (branchPlaceholder) conditions.push(`bi.system_id = ${branchPlaceholder}`);
  return conditions.join(' AND ');
}

export function getSearchColumns(columns: Set<string>): string[] {
  return SEARCH_COLUMNS.filter((c) => columns.has(c)) as string[];
}

// alias: table alias prefix, e.g. 'ai' → generates `coalesce(ai.item, '')`
export function buildSearchVector(columns: Set<string>, alias = ''): string {
  const prefix = alias ? `${alias}.` : '';
  const cols = getSearchColumns(columns);
  if (cols.length === 0) return `''::tsvector`;
  return `to_tsvector('english', ${cols
    .map((c) => `coalesce(${prefix}${c}, '')`)
    .join(` || ' ' || `)})`;
}

export function buildIlikeClause(columns: Set<string>, placeholder: string, alias = ''): string {
  const prefix = alias ? `${alias}.` : '';
  const cols = getSearchColumns(columns);
  if (cols.length === 0) return 'false';
  return `(${cols.map((c) => `${prefix}${c} ILIKE ${placeholder}`).join(' OR ')})`;
}

export function formatProductLabel(code: string): string {
  const cleaned = code.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return code;
  return cleaned
    .split(' ')
    .map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}

/** SELECT clause for item list queries (JOIN with agility_item_branch aliased as bi). */
export function buildItemSelect(columns: Set<string>): string {
  return `SELECT
    ai.item AS item_number,
    ai.description,
    ai.short_des AS short_description,
    ai.ext_description AS extended_description,
    bi.size_ AS size,
    ai.type,
    ai.stocking_uom,
    bi.handling_code,
    bi.qty_on_hand::float8 AS qty_on_hand,
    bi.default_location,
    ${columns.has('primary_supplier') ? 'ai.primary_supplier' : 'NULL::text'} AS primary_supplier,
    bi.system_id,
    bi.active_flag,
    bi.stock`;
}

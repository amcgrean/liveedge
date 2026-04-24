import { getErpSql } from '../../../../db/supabase';

export type ErpSql = ReturnType<typeof getErpSql>;
export type GroupSource = 'link_product_group' | 'handling_code';

export type ProductCapabilities = {
  hasPrimarySupplier: boolean;
  hasMajor: boolean;
  hasMinor: boolean;
};

type ColumnRow = {
  column_name: string;
};

const BASE_SEARCH_COLUMNS = [
  'item',
  'description',
  'ext_description',
  'short_des',
  'size_',
  'type',
  'stocking_uom',
  'link_product_group',
  'handling_code',
  'default_location',
] as const;

export async function getAgilityItemColumns(sql: ErpSql): Promise<Set<string>> {
  const rows = (await sql.unsafe(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'agility_items'`
  )) as ColumnRow[];

  return new Set(rows.map((row) => row.column_name));
}

export function getProductCapabilities(columns: Set<string>): ProductCapabilities {
  return {
    hasPrimarySupplier: columns.has('primary_supplier'),
    hasMajor: columns.has('product_major_code') && columns.has('product_major'),
    hasMinor: columns.has('product_minor_code') && columns.has('product_minor'),
  };
}

export function parseIncludeInactive(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

export function isProductAdmin(user: { role?: string | null; roles?: string[] | null }): boolean {
  return (
    user.role === 'admin' ||
    (user.roles ?? []).some((role) => ['admin', 'supervisor', 'ops', 'sales'].includes(role))
  );
}

export function addParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

export function appendBaseProductFilters(
  where: string[],
  params: unknown[],
  branch: string,
  includeInactive: boolean
) {
  where.push('is_deleted = false');

  if (!includeInactive) {
    where.push('active_flag = true');
    where.push('stock = true');
  }

  if (branch) {
    where.push(`system_id = ${addParam(params, branch)}`);
  }
}

export function parseGroupSource(value: string | null): GroupSource | null {
  if (value === 'link_product_group' || value === 'handling_code') return value;
  return null;
}

export function getGroupColumn(source: GroupSource): string {
  return source === 'handling_code' ? 'handling_code' : 'link_product_group';
}

export async function resolveGroupSource(
  sql: ErpSql,
  branch: string,
  includeInactive: boolean
): Promise<GroupSource> {
  const params: unknown[] = [];
  const where: string[] = [];
  appendBaseProductFilters(where, params, branch, includeInactive);
  where.push(`NULLIF(link_product_group, '') IS NOT NULL`);

  const rows = (await sql.unsafe(
    `SELECT 1
     FROM public.agility_items
     WHERE ${where.join(' AND ')}
     LIMIT 1`,
    params as never[]
  )) as unknown[];

  return rows.length > 0 ? 'link_product_group' : 'handling_code';
}

export function getSearchColumns(columns: Set<string>): string[] {
  const searchColumns: string[] = BASE_SEARCH_COLUMNS.filter((column) => columns.has(column));
  if (columns.has('primary_supplier')) searchColumns.push('primary_supplier');
  return searchColumns;
}

export function buildSearchVector(columns: Set<string>): string {
  return `to_tsvector('english', ${getSearchColumns(columns)
    .map((column) => `coalesce(${column}, '')`)
    .join(` || ' ' || `)})`;
}

export function buildIlikeClause(columns: Set<string>, placeholder: string): string {
  return `(${getSearchColumns(columns)
    .map((column) => `${column} ILIKE ${placeholder}`)
    .join(' OR ')})`;
}

export function formatProductLabel(code: string): string {
  const cleaned = code.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return code;

  return cleaned
    .split(' ')
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

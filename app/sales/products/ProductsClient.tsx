'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  DoorOpen,
  Hammer,
  Home,
  Layers,
  Loader2,
  Package,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

type Tile = {
  code: string;
  label: string;
  item_count: number;
};

interface Product {
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
}

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
}

type BrowseLevel =
  | { mode: 'groups' }
  | { mode: 'majors'; group: string; groupLabel: string }
  | { mode: 'minors'; group: string; groupLabel: string; major: string; majorLabel: string }
  | {
      mode: 'items';
      group?: string;
      groupLabel?: string;
      major?: string;
      majorLabel?: string;
      minor?: string;
      minorLabel?: string;
    };

const PAGE_SIZE = 50;

const HC_COLORS: Record<string, string> = {
  DOOR1: 'bg-blue-500/20 text-blue-300',
  Door1: 'bg-blue-500/20 text-blue-300',
  'Door Plant': 'bg-blue-500/20 text-blue-300',
  EWP: 'bg-emerald-500/20 text-emerald-300',
  TRIM: 'bg-purple-500/20 text-purple-300',
  Trim: 'bg-purple-500/20 text-purple-300',
  DECK: 'bg-orange-500/20 text-orange-300',
  'Deck Bldg': 'bg-orange-500/20 text-orange-300',
  STAIR: 'bg-yellow-500/20 text-yellow-300',
  Yard: 'bg-cyan-500/20 text-cyan-300',
};

export default function ProductsClient({ isAdmin, userBranch }: Props) {
  usePageTracking();

  const [browseLevel, setBrowseLevel] = useState<BrowseLevel>({ mode: 'groups' });
  const [groupTiles, setGroupTiles] = useState<Tile[]>([]);
  const [majorTiles, setMajorTiles] = useState<Tile[]>([]);
  const [minorTiles, setMinorTiles] = useState<Tile[]>([]);
  const [browseProducts, setBrowseProducts] = useState<Product[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [searchProducts, setSearchProducts] = useState<Product[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState(userBranch ?? '');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [groupSource, setGroupSource] = useState<'link_product_group' | 'handling_code'>('link_product_group');
  const [supportsMajor, setSupportsMajor] = useState(false);
  const [supportsMinor, setSupportsMinor] = useState(false);
  const [hasPrimarySupplier, setHasPrimarySupplier] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSearchMode = q.trim().length >= 2;

  const makeParams = useCallback(() => {
    const params = new URLSearchParams();
    const trimmedBranch = branch.trim();
    if (trimmedBranch) params.set('branch', trimmedBranch);
    if (includeInactive) params.set('includeInactive', 'true');
    return params;
  }, [branch, includeInactive]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = makeParams();
      const res = await fetch(`/api/sales/products/groups?${params}`);
      if (!res.ok) throw new Error('Unable to load product groups');

      const data = await res.json();
      setGroupTiles(data.groups ?? []);
      setGroupSource(data.groupSource ?? 'link_product_group');
      setSupportsMajor(Boolean(data.supportsMajor));
      setSupportsMinor(Boolean(data.supportsMinor));
      setHasPrimarySupplier(data.hasPrimarySupplier !== false);
      setMajorTiles([]);
      setMinorTiles([]);
      setBrowseProducts([]);
      setBrowseTotal(0);
      setBrowseLevel({ mode: 'groups' });
    } catch (err) {
      console.error('[ProductsClient loadGroups]', err);
      setError('Products could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [makeParams]);

  const loadBrowseItems = useCallback(
    async (level: Extract<BrowseLevel, { mode: 'items' }>, offset = 0, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = makeParams();
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(offset));
        if (level.group) {
          params.set('group', level.group);
          params.set('groupSource', groupSource);
        }
        if (level.major) params.set('major', level.major);
        if (level.minor) params.set('minor', level.minor);

        const res = await fetch(`/api/sales/products?${params}`);
        if (!res.ok) throw new Error('Unable to load products');

        const data = await res.json();
        const rows: Product[] = data.products ?? [];
        setBrowseProducts((current) => (append ? [...current, ...rows] : rows));
        setBrowseTotal(data.total ?? 0);
      } catch (err) {
        console.error('[ProductsClient loadBrowseItems]', err);
        setError('Products could not be loaded.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [groupSource, makeParams]
  );

  const loadSearch = useCallback(
    async (query: string, offset = 0, append = false) => {
      if (query.trim().length < 2) {
        setSearchProducts([]);
        setSearchTotal(0);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setSearchLoading(true);
      }
      setError(null);

      try {
        const params = makeParams();
        params.set('q', query.trim());
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(offset));

        const res = await fetch(`/api/sales/products?${params}`);
        if (!res.ok) throw new Error('Unable to search products');

        const data = await res.json();
        const rows: Product[] = data.products ?? [];
        setSearchProducts((current) => (append ? [...current, ...rows] : rows));
        setSearchTotal(data.total ?? 0);
      } catch (err) {
        console.error('[ProductsClient loadSearch]', err);
        setError('Search failed.');
      } finally {
        setSearchLoading(false);
        setLoadingMore(false);
      }
    },
    [makeParams]
  );

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    const query = q.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setSearchProducts([]);
      setSearchTotal(0);
      setSearchLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void loadSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadSearch, q]);

  const handleGroupClick = async (tile: Tile) => {
    if (!supportsMajor) {
      const nextLevel: BrowseLevel = { mode: 'items', group: tile.code, groupLabel: tile.label };
      setBrowseLevel(nextLevel);
      await loadBrowseItems(nextLevel);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = makeParams();
      params.set('group', tile.code);
      params.set('groupSource', groupSource);

      const res = await fetch(`/api/sales/products/majors?${params}`);
      if (!res.ok) throw new Error('Unable to load product majors');

      const data = await res.json();
      const tiles: Tile[] = data.majors ?? [];
      if (data.groupSource) setGroupSource(data.groupSource);

      if (!data.available || tiles.length === 0) {
        const nextLevel: BrowseLevel = { mode: 'items', group: tile.code, groupLabel: tile.label };
        setBrowseLevel(nextLevel);
        await loadBrowseItems(nextLevel);
        return;
      }

      setMajorTiles(tiles);
      setMinorTiles([]);
      setBrowseProducts([]);
      setBrowseTotal(0);
      setBrowseLevel({ mode: 'majors', group: tile.code, groupLabel: tile.label });
    } catch (err) {
      console.error('[ProductsClient handleGroupClick]', err);
      setError('Product majors could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleMajorClick = async (tile: Tile) => {
    const currentGroup = 'group' in browseLevel ? browseLevel.group : undefined;
    const currentGroupLabel = 'groupLabel' in browseLevel ? browseLevel.groupLabel : undefined;
    if (!currentGroup) return;

    if (!supportsMinor) {
      const nextLevel: BrowseLevel = {
        mode: 'items',
        group: currentGroup,
        groupLabel: currentGroupLabel ?? currentGroup,
        major: tile.code,
        majorLabel: tile.label,
      };
      setBrowseLevel(nextLevel);
      await loadBrowseItems(nextLevel);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = makeParams();
      params.set('group', currentGroup);
      params.set('groupSource', groupSource);
      params.set('major', tile.code);

      const res = await fetch(`/api/sales/products/minors?${params}`);
      if (!res.ok) throw new Error('Unable to load product minors');

      const data = await res.json();
      const tiles: Tile[] = data.minors ?? [];
      if (data.groupSource) setGroupSource(data.groupSource);

      if (!data.available || tiles.length === 0) {
        const nextLevel: BrowseLevel = {
          mode: 'items',
          group: currentGroup,
          groupLabel: currentGroupLabel ?? currentGroup,
          major: tile.code,
          majorLabel: tile.label,
        };
        setBrowseLevel(nextLevel);
        await loadBrowseItems(nextLevel);
        return;
      }

      setMinorTiles(tiles);
      setBrowseProducts([]);
      setBrowseTotal(0);
      setBrowseLevel({
        mode: 'minors',
        group: currentGroup,
        groupLabel: currentGroupLabel ?? currentGroup,
        major: tile.code,
        majorLabel: tile.label,
      });
    } catch (err) {
      console.error('[ProductsClient handleMajorClick]', err);
      setError('Product minors could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleMinorClick = async (tile: Tile) => {
    if (browseLevel.mode !== 'minors') return;

    const nextLevel: BrowseLevel = {
      mode: 'items',
      group: browseLevel.group,
      groupLabel: browseLevel.groupLabel,
      major: browseLevel.major,
      majorLabel: browseLevel.majorLabel,
      minor: tile.code,
      minorLabel: tile.label,
    };
    setBrowseLevel(nextLevel);
    await loadBrowseItems(nextLevel);
  };

  const clearSearch = () => {
    setQ('');
    setSearchProducts([]);
    setSearchTotal(0);
    setSearchLoading(false);
  };

  const handleLoadMore = async () => {
    if (isSearchMode) {
      await loadSearch(q.trim(), searchProducts.length, true);
      return;
    }

    if (browseLevel.mode === 'items') {
      await loadBrowseItems(browseLevel, browseProducts.length, true);
    }
  };

  const visibleProducts = isSearchMode ? searchProducts : browseProducts;
  const visibleTotal = isSearchMode ? searchTotal : browseTotal;
  const visibleLoading = isSearchMode ? searchLoading : loading;
  const canLoadMore = visibleProducts.length < visibleTotal;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sales" className="text-sm text-cyan-400 hover:underline">
            &larr; Sales Hub
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">Products &amp; Stock</h1>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="Branch"
              aria-label="Branch"
              className="w-28 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
              />
              Show inactive / non-stocking
            </label>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search item #, description, size, handling..."
            className="w-full bg-slate-800 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {isSearchMode && (
          <button
            type="button"
            onClick={clearSearch}
            className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to browse
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!isSearchMode && <Breadcrumb level={browseLevel} onAllGroups={loadGroups} onGroup={handleGroupClick} onMajor={handleMajorClick} />}

      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-300">{getHeaderText(isSearchMode, q, browseLevel, visibleTotal)}</span>
          {(visibleLoading || loadingMore) && (
            <span className="inline-flex items-center gap-2 text-xs text-cyan-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading
            </span>
          )}
        </div>

        {isSearchMode ? (
          <ProductsTable
            products={searchProducts}
            isAdmin={isAdmin}
            showSupplier={hasPrimarySupplier}
            loading={searchLoading}
            emptyText={`No items found for "${q.trim()}"`}
          />
        ) : (
          <BrowseContent
            level={browseLevel}
            loading={loading}
            groups={groupTiles}
            majors={majorTiles}
            minors={minorTiles}
            products={browseProducts}
            isAdmin={isAdmin}
            showSupplier={hasPrimarySupplier}
            onGroup={handleGroupClick}
            onMajor={handleMajorClick}
            onMinor={handleMinorClick}
          />
        )}

        {(browseLevel.mode === 'items' || isSearchMode) && canLoadMore && (
          <div className="border-t border-white/10 p-4 text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BrowseContent({
  level,
  loading,
  groups,
  majors,
  minors,
  products,
  isAdmin,
  showSupplier,
  onGroup,
  onMajor,
  onMinor,
}: {
  level: BrowseLevel;
  loading: boolean;
  groups: Tile[];
  majors: Tile[];
  minors: Tile[];
  products: Product[];
  isAdmin: boolean;
  showSupplier: boolean;
  onGroup: (tile: Tile) => void;
  onMajor: (tile: Tile) => void;
  onMinor: (tile: Tile) => void;
}) {
  if (level.mode === 'groups') {
    return <TileGrid tiles={groups} loading={loading} emptyText="No product groups found" onSelect={onGroup} />;
  }

  if (level.mode === 'majors') {
    return <TileGrid tiles={majors} loading={loading} emptyText="No product majors found" onSelect={onMajor} />;
  }

  if (level.mode === 'minors') {
    return <TileGrid tiles={minors} loading={loading} emptyText="No product minors found" onSelect={onMinor} />;
  }

  return (
    <ProductsTable
      products={products}
      isAdmin={isAdmin}
      showSupplier={showSupplier}
      loading={loading}
      emptyText="No items found"
    />
  );
}

function TileGrid({
  tiles,
  loading,
  emptyText,
  onSelect,
}: {
  tiles: Tile[];
  loading: boolean;
  emptyText: string;
  onSelect: (tile: Tile) => void;
}) {
  if (tiles.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
        <Package className="w-10 h-10 opacity-30" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {tiles.map((tile) => {
        const Icon = getTileIcon(tile.label);
        return (
          <button
            key={tile.code}
            type="button"
            onClick={() => onSelect(tile)}
            className="min-h-32 rounded-xl border border-white/10 bg-slate-800 p-4 text-left transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <Icon className="mb-4 h-7 w-7 text-cyan-400" />
            <div className="break-words text-sm font-semibold uppercase text-white">{tile.label}</div>
            <div className="mt-2 text-xs text-slate-400">{formatCount(tile.item_count, 'item')}</div>
          </button>
        );
      })}
    </div>
  );
}

function ProductsTable({
  products,
  isAdmin,
  showSupplier,
  loading,
  emptyText,
}: {
  products: Product[];
  isAdmin: boolean;
  showSupplier: boolean;
  loading: boolean;
  emptyText: string;
}) {
  if (products.length === 0 && !loading) {
    return (
      <div className="px-4 py-12 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Item #</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Description</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Size</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">UOM</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">On Hand</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Location</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Handling</th>
            {showSupplier && (
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Supplier</th>
            )}
            {isAdmin && (
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Branch</th>
            )}
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => (
            <tr
              key={`${product.item_number}-${product.system_id ?? 'branch'}-${index}`}
              className="border-b border-white/5 hover:bg-slate-800/50"
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-cyan-400">
                {product.item_number}
              </td>
              <td className="min-w-72 px-4 py-3 text-slate-200">
                <div>{product.description ?? product.short_description ?? <span className="text-slate-500">&mdash;</span>}</div>
                {product.extended_description && (
                  <div className="mt-1 max-w-xl truncate text-xs text-slate-500">{product.extended_description}</div>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">{product.size ?? <span className="text-slate-500">&mdash;</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">{product.stocking_uom ?? <span className="text-slate-500">&mdash;</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-200">{formatQty(product.qty_on_hand)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">{product.default_location ?? <span className="text-slate-500">&mdash;</span>}</td>
              <td className="whitespace-nowrap px-4 py-3">
                {product.handling_code ? (
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                      HC_COLORS[product.handling_code] ?? 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {product.handling_code}
                  </span>
                ) : (
                  <span className="text-slate-500">&mdash;</span>
                )}
              </td>
              {showSupplier && (
                <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                  {product.primary_supplier ?? <span className="text-slate-500">&mdash;</span>}
                </td>
              )}
              {isAdmin && (
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                  {product.system_id ?? <span className="text-slate-500">&mdash;</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Breadcrumb({
  level,
  onAllGroups,
  onGroup,
  onMajor,
}: {
  level: BrowseLevel;
  onAllGroups: () => void;
  onGroup: (tile: Tile) => void;
  onMajor: (tile: Tile) => void;
}) {
  const groupCode = 'group' in level ? level.group : undefined;
  const groupLabel = 'groupLabel' in level ? level.groupLabel : undefined;
  const majorCode = 'major' in level ? level.major : undefined;
  const majorLabel = 'majorLabel' in level ? level.majorLabel : undefined;
  const minorCode = 'minor' in level ? level.minor : undefined;
  const minorLabel = 'minorLabel' in level ? level.minorLabel : undefined;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-400">
      <button type="button" onClick={onAllGroups} className="hover:text-cyan-400">
        All Groups
      </button>

      {groupCode && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <button
            type="button"
            onClick={() => onGroup({ code: groupCode, label: groupLabel ?? groupCode, item_count: 0 })}
            className={level.mode === 'majors' ? 'text-slate-200' : 'hover:text-cyan-400'}
          >
            {groupLabel ?? groupCode}
          </button>
        </>
      )}

      {majorCode && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <button
            type="button"
            onClick={() => onMajor({ code: majorCode, label: majorLabel ?? majorCode, item_count: 0 })}
            className={level.mode === 'minors' ? 'text-slate-200' : 'hover:text-cyan-400'}
          >
            {majorLabel ?? majorCode}
          </button>
        </>
      )}

      {minorCode && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-slate-200">{minorLabel ?? minorCode}</span>
        </>
      )}
    </nav>
  );
}

function getHeaderText(isSearchMode: boolean, query: string, level: BrowseLevel, total: number): string {
  if (isSearchMode) return `${formatCount(total, 'item')} found for "${query.trim()}"`;

  if (level.mode === 'groups') return 'Product groups';
  if (level.mode === 'majors') return `${level.groupLabel} majors`;
  if (level.mode === 'minors') return `${level.majorLabel} minors`;

  const label = level.minorLabel ?? level.majorLabel ?? level.groupLabel ?? 'Products';
  return `${formatCount(total, 'item')} in ${label}`;
}

function getTileIcon(label: string): LucideIcon {
  const value = label.toLowerCase();
  if (value.includes('door') || value.includes('window')) return DoorOpen;
  if (value.includes('roof') || value.includes('siding')) return Home;
  if (value.includes('lumber') || value.includes('framing') || value.includes('yard')) return Hammer;
  if (value.includes('trim') || value.includes('mould')) return Layers;
  if (value.includes('deck') || value.includes('ewp')) return Boxes;
  return Package;
}

function formatQty(value: number | null): React.ReactNode {
  if (value === null || Number.isNaN(Number(value))) return <span className="text-slate-500">&mdash;</span>;
  return Math.round(Number(value)).toLocaleString();
}

function formatCount(value: number, noun: string): string {
  return `${value.toLocaleString()} ${noun}${value === 1 ? '' : 's'}`;
}

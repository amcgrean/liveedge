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

type Tile = { code: string; label: string; item_count: number };

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
  system_id: string | null;
  active_flag: boolean | null;
  stock: boolean | null;
}

interface Props {
  isAdmin: boolean;
}

// BrowseLevel state machine:
//   groups  → shows product-major tiles
//   majors  → shows product-minor tiles for the selected major
//   items   → shows stock items for the selected major + minor
type BrowseLevel =
  | { mode: 'groups' }
  | { mode: 'majors'; majorCode: string; majorLabel: string }
  | { mode: 'items'; majorCode?: string; majorLabel?: string; minorCode?: string; minorLabel?: string };

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

export default function ProductsClient({ isAdmin }: Props) {
  usePageTracking();

  const [browseLevel, setBrowseLevel] = useState<BrowseLevel>({ mode: 'groups' });
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
  const [includeInactive, setIncludeInactive] = useState(false);
  const [hasPrimarySupplier, setHasPrimarySupplier] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSearchMode = q.trim().length >= 2;

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  const loadMajors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (includeInactive) params.set('includeInactive', 'true');
      const res = await fetch(`/api/sales/products/groups?${params}`);
      if (!res.ok) throw new Error('Failed to load product groups');
      const data = await res.json();
      setMajorTiles(data.groups ?? []);
      setMinorTiles([]);
      setBrowseProducts([]);
      setBrowseTotal(0);
      setBrowseLevel({ mode: 'groups' });
    } catch (err) {
      console.error('[ProductsClient loadMajors]', err);
      setError('Product groups could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  const loadMinors = useCallback(async (majorCode: string, majorLabel: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ group: majorCode });
      if (includeInactive) params.set('includeInactive', 'true');
      const res = await fetch(`/api/sales/products/majors?${params}`);
      if (!res.ok) throw new Error('Failed to load product minors');
      const data = await res.json();
      const tiles: Tile[] = data.majors ?? [];

      if (!data.available || tiles.length === 0) {
        // No minors — go straight to items
        const level: Extract<BrowseLevel, { mode: 'items' }> = {
          mode: 'items', majorCode, majorLabel,
        };
        setBrowseLevel(level);
        await loadBrowseItemsDirect(level);
        return;
      }

      setMinorTiles(tiles);
      setBrowseProducts([]);
      setBrowseTotal(0);
      setBrowseLevel({ mode: 'majors', majorCode, majorLabel });
    } catch (err) {
      console.error('[ProductsClient loadMinors]', err);
      setError('Product categories could not be loaded.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  const loadBrowseItemsDirect = useCallback(
    async (level: Extract<BrowseLevel, { mode: 'items' }>, offset = 0, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
        if (level.majorCode) params.set('group', level.majorCode);
        if (level.minorCode) params.set('major', level.minorCode);
        if (includeInactive) params.set('includeInactive', 'true');

        const res = await fetch(`/api/sales/products?${params}`);
        if (!res.ok) throw new Error('Failed to load products');
        const data = await res.json();
        const rows: Product[] = data.products ?? [];
        setBrowseProducts((cur: Product[]) => (append ? [...cur, ...rows] : rows));
        setBrowseTotal(data.total ?? 0);
        setHasPrimarySupplier(rows.some((r) => r.primary_supplier !== null));
      } catch (err) {
        console.error('[ProductsClient loadBrowseItems]', err);
        setError('Products could not be loaded.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [includeInactive]
  );

  const loadSearch = useCallback(async (query: string, offset = 0, append = false) => {
    if (query.length < 2) { setSearchProducts([]); setSearchTotal(0); return; }
    if (append) setLoadingMore(true);
    else setSearchLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), offset: String(offset) });
      if (includeInactive) params.set('includeInactive', 'true');
      const res = await fetch(`/api/sales/products?${params}`);
      if (!res.ok) throw new Error('Failed to search products');
      const data = await res.json();
      const rows: Product[] = data.products ?? [];
      setSearchProducts((cur: Product[]) => (append ? [...cur, ...rows] : rows));
      setSearchTotal(data.total ?? 0);
      setHasPrimarySupplier((prev: boolean) => prev || rows.some((r) => r.primary_supplier !== null));
    } catch (err) {
      console.error('[ProductsClient loadSearch]', err);
      setError('Search failed.');
    } finally {
      setSearchLoading(false);
      setLoadingMore(false);
    }
  }, [includeInactive]);

  // Load majors on mount
  useEffect(() => { void loadMajors(); }, [loadMajors]);

  // Debounced search
  useEffect(() => {
    const query = q.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setSearchProducts([]); setSearchTotal(0); setSearchLoading(false); return; }
    debounceRef.current = setTimeout(() => { void loadSearch(query); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [loadSearch, q]);

  // ---------------------------------------------------------------------------
  // Click handlers
  // ---------------------------------------------------------------------------

  const handleMajorClick = (tile: Tile) => {
    void loadMinors(tile.code, tile.label);
  };

  const handleMinorClick = async (tile: Tile) => {
    if (browseLevel.mode !== 'majors') return;
    const level: Extract<BrowseLevel, { mode: 'items' }> = {
      mode: 'items',
      majorCode: browseLevel.majorCode,
      majorLabel: browseLevel.majorLabel,
      minorCode: tile.code,
      minorLabel: tile.label,
    };
    setBrowseLevel(level);
    await loadBrowseItemsDirect(level);
  };

  const handleLoadMore = async () => {
    if (isSearchMode) { await loadSearch(q.trim(), searchProducts.length, true); return; }
    if (browseLevel.mode === 'items') await loadBrowseItemsDirect(browseLevel, browseProducts.length, true);
  };

  const clearSearch = () => { setQ(''); setSearchProducts([]); setSearchTotal(0); setSearchLoading(false); };

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const visibleProducts = isSearchMode ? searchProducts : browseProducts;
  const visibleTotal = isSearchMode ? searchTotal : browseTotal;
  const visibleLoading = isSearchMode ? searchLoading : loading;
  const canLoadMore = visibleProducts.length < visibleTotal;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sales" className="text-sm text-cyan-400 hover:underline">&larr; Sales Hub</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Products &amp; Stock</h1>
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-slate-300 mt-6">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeInactive(e.target.checked)}
              className="h-4 w-4 rounded border-white/10 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
            />
            Show inactive / non-stocking
          </label>
        )}
      </div>

      {/* Search bar */}
      <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            placeholder="Search item #, description, size, handling code..."
            className="w-full bg-slate-800 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
        {isSearchMode && (
          <button type="button" onClick={clearSearch} className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300">
            <ArrowLeft className="h-4 w-4" />
            Back to browse
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      {!isSearchMode && (
        <Breadcrumb level={browseLevel} onAllGroups={loadMajors} onMajor={handleMajorClick} />
      )}

      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        {/* Header row */}
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
          <ProductsTable products={searchProducts} isAdmin={isAdmin} showSupplier={hasPrimarySupplier} loading={searchLoading} emptyText={`No items found for "${q.trim()}"`} />
        ) : (
          <BrowseContent
            level={browseLevel}
            loading={loading}
            majors={majorTiles}
            minors={minorTiles}
            products={browseProducts}
            isAdmin={isAdmin}
            showSupplier={hasPrimarySupplier}
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BrowseContent({
  level, loading, majors, minors, products, isAdmin, showSupplier, onMajor, onMinor,
}: {
  level: BrowseLevel;
  loading: boolean;
  majors: Tile[];
  minors: Tile[];
  products: Product[];
  isAdmin: boolean;
  showSupplier: boolean;
  onMajor: (tile: Tile) => void;
  onMinor: (tile: Tile) => void;
}) {
  if (level.mode === 'groups') {
    return <TileGrid tiles={majors} loading={loading} emptyText="No product groups found" onSelect={onMajor} />;
  }
  if (level.mode === 'majors') {
    return <TileGrid tiles={minors} loading={loading} emptyText="No product categories found" onSelect={onMinor} />;
  }
  return <ProductsTable products={products} isAdmin={isAdmin} showSupplier={showSupplier} loading={loading} emptyText="No items found" />;
}

function TileGrid({ tiles, loading, emptyText, onSelect }: { tiles: Tile[]; loading: boolean; emptyText: string; onSelect: (tile: Tile) => void }) {
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

function ProductsTable({ products, isAdmin, showSupplier, loading, emptyText }: {
  products: Product[]; isAdmin: boolean; showSupplier: boolean; loading: boolean; emptyText: string;
}) {
  if (products.length === 0 && !loading) {
    return <div className="px-4 py-12 text-center text-sm text-slate-500">{emptyText}</div>;
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
            {showSupplier && <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Supplier</th>}
            {isAdmin && <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Branch</th>}
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => (
            <tr key={`${p.item_number}-${p.system_id ?? ''}-${i}`} className="border-b border-white/5 hover:bg-slate-800/50">
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-cyan-400">{p.item_number}</td>
              <td className="min-w-72 px-4 py-3 text-slate-200">
                <div>{p.description ?? p.short_description ?? <span className="text-slate-500">&mdash;</span>}</div>
                {p.extended_description && (
                  <div className="mt-1 max-w-xl truncate text-xs text-slate-500">{p.extended_description}</div>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">{p.size ?? <span className="text-slate-500">&mdash;</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">{p.stocking_uom ?? <span className="text-slate-500">&mdash;</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-200">{formatQty(p.qty_on_hand)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">{p.default_location ?? <span className="text-slate-500">&mdash;</span>}</td>
              <td className="whitespace-nowrap px-4 py-3">
                {p.handling_code
                  ? <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${HC_COLORS[p.handling_code] ?? 'bg-slate-700 text-slate-300'}`}>{p.handling_code}</span>
                  : <span className="text-slate-500">&mdash;</span>}
              </td>
              {showSupplier && (
                <td className="whitespace-nowrap px-4 py-3 text-slate-300">{p.primary_supplier ?? <span className="text-slate-500">&mdash;</span>}</td>
              )}
              {isAdmin && (
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{p.system_id ?? <span className="text-slate-500">&mdash;</span>}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Breadcrumb({ level, onAllGroups, onMajor }: {
  level: BrowseLevel;
  onAllGroups: () => void;
  onMajor: (tile: Tile) => void;
}) {
  const majorCode = 'majorCode' in level ? level.majorCode : undefined;
  const majorLabel = 'majorLabel' in level ? level.majorLabel : undefined;
  const minorLabel = 'minorLabel' in level ? level.minorLabel : undefined;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-400">
      <button type="button" onClick={onAllGroups} className="hover:text-cyan-400">All Products</button>
      {majorCode && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <button
            type="button"
            onClick={() => onMajor({ code: majorCode, label: majorLabel ?? majorCode, item_count: 0 })}
            className={level.mode === 'majors' ? 'text-slate-200' : 'hover:text-cyan-400'}
          >
            {majorLabel ?? majorCode}
          </button>
        </>
      )}
      {minorLabel && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-slate-200">{minorLabel}</span>
        </>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHeaderText(isSearchMode: boolean, query: string, level: BrowseLevel, total: number): string {
  if (isSearchMode) return `${formatCount(total, 'item')} found for "${query.trim()}"`;
  if (level.mode === 'groups') return 'Product groups';
  if (level.mode === 'majors') return `${level.majorLabel} — categories`;
  const label = level.minorLabel ?? level.majorLabel ?? 'Products';
  return `${formatCount(total, 'item')} in ${label}`;
}

function getTileIcon(label: string): LucideIcon {
  const v = label.toLowerCase();
  if (v.includes('door') || v.includes('window')) return DoorOpen;
  if (v.includes('roof') || v.includes('siding')) return Home;
  if (v.includes('lumber') || v.includes('framing') || v.includes('yard')) return Hammer;
  if (v.includes('trim') || v.includes('mould')) return Layers;
  if (v.includes('deck') || v.includes('ewp')) return Boxes;
  return Package;
}

function formatQty(value: number | null): React.ReactNode {
  if (value === null || Number.isNaN(Number(value))) return <span className="text-slate-500">&mdash;</span>;
  return Math.round(Number(value)).toLocaleString();
}

function formatCount(value: number, noun: string): string {
  return `${value.toLocaleString()} ${noun}${value === 1 ? '' : 's'}`;
}

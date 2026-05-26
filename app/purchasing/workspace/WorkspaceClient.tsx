'use client';

/**
 * Buyer Workspace — /purchasing/workspace
 * Ported from the Claude Design handoff
 * (docs/agent-prompts/buyer-workspace-dashboard-design.md +
 *  LiveEdge bundle workspace.jsx). One fetch to
 * /api/purchasing/workspace pulls all six tile feeds.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePageTracking } from '@/hooks/usePageTracking';
import {
  RefreshCw, Plus, ArrowRight, Box, Search, BarChart3, Calendar, Cog,
} from 'lucide-react';

// ---- Types matching the aggregator ----

type Dir = 'up' | 'down' | null;

interface BuyNowFeed {
  count: number;
  estimatedValue: number;
  redCount: number;
  amberCount: number;
  deltaYesterday: number;
  deltaDir: Dir;
  spark: number[];
  supplierRollup: { name: string; items: number; value: number; critical: number; leadDays: number | null }[];
}
interface OutageRiskFeed {
  count: number;
  criticalCount: number;
  deltaYesterday: number;
  deltaDir: Dir;
  spark: number[];
  topItems: {
    sku: string; desc: string | null; branch: string; dtz: number;
    isCritical: boolean; category: string | null; onHand: number; weeklyUsage: number;
  }[];
}
interface OverduePOsFeed {
  count: number; value: number; deltaYesterday: number; deltaDir: Dir;
  top: { po: string; vendor: string | null; branch: string | null; expect: string | null; daysLate: number; value: number; lines: number }[];
}
interface PendingCheckinsFeed {
  count: number; totalLines: number; withDiscrepancy: number; deltaYesterday: number; deltaDir: Dir;
  top: { id: string; po: string; vendor: string | null; branch: string | null; age: string; lines: number; discrepancy: boolean }[];
}
interface POExceptionsFeed {
  count: number;
  byKind: { noReceipt: number; shortReceive: number; priceVariance: number };
  deltaYesterday: number;
  deltaDir: Dir;
  top: { kind: 'no_receipt'|'short_receive'|'price_variance'; po: string; vendor: string | null; branch: string | null; days: number; value: number | null; msg: string }[];
}
interface RecentMovementFeed {
  upCount: number; downCount: number; total: number; deltaWeek: number; deltaDir: Dir;
  top: { sku: string; desc: string | null; branch: string; dir: 'up'|'down'; pct: number; weeklyNow: number; weeklyPrior: number; onHand: number; note: string | null }[];
}
interface WorkspaceFeed {
  buyNow: BuyNowFeed;
  outageRisk: OutageRiskFeed;
  overduePOs: OverduePOsFeed;
  pendingCheckins: PendingCheckinsFeed;
  poExceptions: POExceptionsFeed;
  recentMovement: RecentMovementFeed;
  asOf: string;
}

// ---- Branch color/short maps ----

const BR_COLOR: Record<string, string> = { '10FD': '#d05050', '20GR': '#1f8a4f', '25BW': '#c9a83f', '40CV': '#6e7d89' };
const BR_SHORT: Record<string, string> = { '10FD': 'FtD',  '20GR': 'GRM',  '25BW': 'BWD',  '40CV': 'CRV'  };
const BR_ORDER = ['10FD', '20GR', '25BW', '40CV'];

const PO_EXC_KIND_LABEL: Record<string, string> = {
  no_receipt:     'No receipt',
  short_receive:  'Short receive',
  price_variance: 'Price variance',
};
const PO_EXC_KIND_COLOR: Record<string, string> = {
  no_receipt:     '#d05050',
  short_receive:  '#d4a23a',
  price_variance: '#8a6fb8',
};

// ---- Helpers ----

const fmt$ = (v: number | null | undefined): string => {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(v) >= 1_000)     return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
};

// ---- Component ----

interface Props {
  userName: string | null;
  userRole: string | null;
  userBranch: string | null;
  isAllBranchUser: boolean;
}

export default function WorkspaceClient({ userName, userRole, userBranch, isAllBranchUser }: Props) {
  usePageTracking();
  const router = useRouter();

  const [scope, setScope] = useState<string>(
    isAllBranchUser ? 'all' : (userBranch ?? 'all'),
  );
  const [feed, setFeed] = useState<WorkspaceFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams();
      sp.set('branch', scope);
      const res = await fetch(`/api/purchasing/workspace?${sp}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as WorkspaceFeed;
      setFeed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace.');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  const greet = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="ws-root">
      <WorkspaceStyles />

      {/* Page header */}
      <div className="ws-page-header">
        <div>
          <div className="ws-breadcrumb">
            <span>Purchasing</span>
            <span className="ws-sep">›</span>
            <span style={{ color: 'var(--ws-text-2)' }}>Buyer Workspace</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 className="ws-page-title">
              {greet},
              {userName && (
                <span style={{ color: 'var(--ws-text-2)', fontWeight: 500, marginLeft: 6 }}>
                  {userName.replace(/\.$/, '')}.
                </span>
              )}
            </h1>
            {userRole && (
              <span style={{ fontSize: 12, color: 'var(--ws-text-3)', fontFamily: 'var(--ws-mono)' }}>
                · {userRole}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ws-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="ws-btn" disabled title="New PO — coming soon">
            <Plus size={13} /> New PO
          </button>
        </div>
      </div>

      {/* Sticky filter strip */}
      <div className="ws-sticky">
        <span style={{ fontSize: 11, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          Branch
        </span>
        <div className="ws-seg" role="radiogroup" aria-label="Branch scope">
          {isAllBranchUser && (
            <button
              role="radio"
              aria-checked={scope === 'all'}
              className={scope === 'all' ? 'active' : ''}
              onClick={() => setScope('all')}
            >All</button>
          )}
          {BR_ORDER.map((b) => {
            const disabled = !isAllBranchUser && b !== userBranch;
            return (
              <button
                key={b}
                role="radio"
                aria-checked={scope === b}
                className={scope === b ? 'active' : ''}
                disabled={disabled}
                onClick={() => !disabled && setScope(b)}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: BR_COLOR[b] }} />
                {BR_SHORT[b]}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        {feed?.asOf && (
          <span className="ws-asof">
            <span className="ws-live-dot" />
            As of <strong style={{ color: 'var(--ws-text-2)', fontWeight: 600 }}>{feed.asOf}</strong>
          </span>
        )}
      </div>

      {error && (
        <div className="ws-error">Failed to load: {error}</div>
      )}

      {loading && !feed && (
        <div className="ws-loading">Loading workspace…</div>
      )}

      {feed && (
        <div className="ws-content">
          {/* Hero row */}
          <div className="ws-hero">
            <BuyNowTile     data={feed.buyNow}      onDrill={() => router.push('/purchasing/suggested-buys')} />
            <OutageRiskTile data={feed.outageRisk}  onDrill={() => router.push('/purchasing/outages')} />
          </div>

          {/* Secondary row */}
          <div className="ws-secondary">
            <OverduePOsTile      data={feed.overduePOs}      onDrill={() => router.push('/purchasing/open-pos')} />
            <PendingCheckinsTile data={feed.pendingCheckins} onDrill={() => router.push('/purchasing/review')} />
            <POExceptionsTile    data={feed.poExceptions}    onDrill={() => router.push('/purchasing/exceptions?severity=high')} />
            <RecentMovementTile  data={feed.recentMovement}  onDrill={() => router.push('/purchasing/movement')} />
          </div>

          {/* Quick actions */}
          <QuickActions
            onSKULookup={() => router.push('/sales/products')}
            onVendor={() => router.push('/purchasing/scorecard')}
            onForecast={() => router.push('/management/forecast')}
            onItemPlanning={() => router.push('/admin/item-planning')}
            onPOCheckIn={() => router.push('/purchasing')}
          />
        </div>
      )}
    </div>
  );
}

// ====================================================================
// Tile components
// ====================================================================

function Delta({ value, dir, suffix = ' since yesterday' }: { value: number; dir: Dir; suffix?: string }) {
  if (value === 0 && !dir) return null;
  const up = dir === 'up';
  const color = value === 0 ? 'var(--ws-text-3)' : (up ? '#4ec48a' : '#e07b7b');
  const arrow = value === 0 ? '·' : (up ? '▲' : '▼');
  return (
    <span style={{ color, fontSize: 11, fontWeight: 600, fontFamily: 'var(--ws-mono)' }}>
      {arrow} {value > 0 ? '+' : ''}{value}
      <span style={{ color: 'var(--ws-text-3)', fontWeight: 500 }}>{suffix}</span>
    </span>
  );
}

function Sparkline({ data, w = 80, h = 20, color = '#1f8a4f' }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / rng) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const fillPts = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block' }}>
      <polygon points={fillPts} fill={color} opacity="0.10" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function BranchTag({ branch }: { branch: string | null }) {
  if (!branch) return <span style={{ color: 'var(--ws-text-4)', fontSize: 10 }}>—</span>;
  const color = BR_COLOR[branch] || '#6e7d89';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: 16, padding: '0 5px 0 4px', borderRadius: 2,
      background: color + '1f', borderLeft: `2px solid ${color}`,
      fontSize: 10, fontFamily: 'var(--ws-mono)', fontWeight: 600,
      color: 'var(--ws-text-2)', letterSpacing: '0.02em',
    }}>{BR_SHORT[branch] || branch}</span>
  );
}

function Tile({
  accent, accentSoft, hero = false, dense = false, drillLabel, onDrill, children,
}: {
  accent: string; accentSoft?: string; hero?: boolean; dense?: boolean;
  drillLabel?: string; onDrill?: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onDrill}
      className="ws-tile"
      style={{
        textAlign: 'left',
        background: 'var(--ws-panel)',
        border: '1px solid var(--ws-line)',
        borderRadius: 6,
        padding: dense ? '12px 14px 10px' : '14px 16px 12px',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        cursor: onDrill ? 'pointer' : 'default',
        transition: 'border-color 120ms, background 120ms',
        width: '100%',
        minHeight: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.background = accentSoft || 'var(--ws-panel-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--ws-line)';
        e.currentTarget.style.background = 'var(--ws-panel)';
      }}
    >
      <span style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: hero ? 3 : 2, background: accent, opacity: hero ? 1 : 0.7,
      }} />
      {children}
      {drillLabel && (
        <div style={{
          marginTop: 'auto', paddingTop: 10,
          fontSize: 11, color: accent, fontFamily: 'var(--ws-mono)',
          display: 'flex', alignItems: 'center', gap: 4,
          textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
        }}>
          {drillLabel} <ArrowRight size={11} />
        </div>
      )}
    </button>
  );
}

function BuyNowTile({ data, onDrill }: { data: BuyNowFeed; onDrill: () => void }) {
  const accent = '#1f8a4f';
  return (
    <Tile accent={accent} accentSoft="rgba(31,138,79,0.04)" hero drillLabel="Open buying queue" onDrill={onDrill}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: accent, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Buy now</span>
        <span style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'var(--ws-mono)' }}>· red + amber severity</span>
        <span style={{ marginLeft: 'auto' }}>
          <Sparkline data={data.spark} color={accent} w={80} h={20} />
        </span>
      </div>
      {/* Hero number */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <div style={{ fontFamily: 'var(--ws-mono)', fontSize: 46, fontWeight: 600, color: 'var(--ws-text)', lineHeight: 1, letterSpacing: '-0.02em' }}>
          {data.count}<span style={{ fontSize: 18, color: 'var(--ws-text-3)', fontWeight: 500, marginLeft: 4 }}>items</span>
        </div>
        {data.estimatedValue > 0 && (
          <div style={{ fontFamily: 'var(--ws-mono)', fontSize: 22, color: 'var(--ws-text-2)', fontWeight: 500, letterSpacing: '-0.01em' }}>
            ≈ {fmt$(data.estimatedValue)}
          </div>
        )}
      </div>
      {/* Sub */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, fontSize: 12, color: 'var(--ws-text-2)', fontFamily: 'var(--ws-mono)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#d05050' }} />
          <strong style={{ color: 'var(--ws-text)', fontWeight: 600 }}>{data.redCount}</strong>
          <span style={{ color: 'var(--ws-text-3)' }}>red</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#d4a23a' }} />
          <strong style={{ color: 'var(--ws-text)', fontWeight: 600 }}>{data.amberCount}</strong>
          <span style={{ color: 'var(--ws-text-3)' }}>amber</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Delta value={data.deltaYesterday} dir={data.deltaDir} />
        </span>
      </div>
      {/* Supplier rollup */}
      {data.supplierRollup.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--ws-line-soft)' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase',
            letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6,
          }}>
            <span>By supplier</span>
            <span style={{ color: 'var(--ws-text-4)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>items · lead</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {data.supplierRollup.slice(0, 5).map((s) => (
              <div key={s.name} style={{
                display: 'grid', gridTemplateColumns: '1fr 36px 50px',
                gap: 8, alignItems: 'baseline', padding: '3px 0', fontSize: 12,
              }}>
                <span style={{ color: 'var(--ws-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}
                  {s.critical > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 9, fontWeight: 700,
                      color: '#e07b7b', letterSpacing: '0.04em',
                      padding: '1px 4px', borderRadius: 2,
                      background: 'rgba(208,80,80,0.10)',
                      border: '1px solid rgba(208,80,80,0.3)',
                      fontFamily: 'var(--ws-mono)',
                    }}>{s.critical} CRIT</span>
                  )}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--ws-text-2)', fontSize: 11, fontFamily: 'var(--ws-mono)' }}>{s.items}</span>
                <span style={{ textAlign: 'right', color: 'var(--ws-text-3)', fontSize: 10, fontFamily: 'var(--ws-mono)' }}>
                  {s.leadDays != null ? `${s.leadDays}d` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Tile>
  );
}

function OutageRiskTile({ data, onDrill }: { data: OutageRiskFeed; onDrill: () => void }) {
  const accent = '#d05050';
  return (
    <Tile accent={accent} accentSoft="rgba(208,80,80,0.04)" hero drillLabel="Open outage list" onDrill={onDrill}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#e07b7b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          Outage risk · this week
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Sparkline data={data.spark} color="#e07b7b" w={80} h={20} />
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--ws-mono)', fontSize: 46, fontWeight: 600, color: 'var(--ws-text)', lineHeight: 1, letterSpacing: '-0.02em' }}>
          {data.count}<span style={{ fontSize: 18, color: 'var(--ws-text-3)', fontWeight: 500, marginLeft: 4 }}>items</span>
        </div>
        {data.criticalCount > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', background: 'rgba(208,80,80,0.14)',
            border: '1px solid rgba(208,80,80,0.5)', borderRadius: 4,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#d05050',
              boxShadow: '0 0 0 3px rgba(208,80,80,0.18)',
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e07b7b', letterSpacing: '0.04em', fontFamily: 'var(--ws-mono)' }}>
              {data.criticalCount} CRITICAL
            </span>
          </span>
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ws-text-3)', fontFamily: 'var(--ws-mono)', display: 'flex', gap: 12 }}>
        <span>items will hit zero within their lead time</span>
        <span style={{ marginLeft: 'auto' }}>
          <Delta value={data.deltaYesterday} dir={data.deltaDir} />
        </span>
      </div>
      {data.topItems.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--ws-line-soft)' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase',
            letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6,
          }}>
            <span>Top items at risk</span>
            <span style={{ color: 'var(--ws-text-4)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>days-to-zero · onhand / weekly</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {data.topItems.slice(0, 5).map((it) => (
              <div key={`${it.branch}-${it.sku}`} style={{
                display: 'grid', gridTemplateColumns: '14px 1fr 36px 80px 34px',
                gap: 6, alignItems: 'center', padding: '3px 0', fontSize: 12,
              }}>
                <span style={{
                  width: 4, height: 14, borderRadius: 1,
                  background: it.isCritical ? '#d05050' : 'transparent', marginLeft: 2,
                }} title={it.isCritical ? 'Critical item' : ''} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: 'var(--ws-text)', fontWeight: 600, fontSize: 11, fontFamily: 'var(--ws-mono)' }}>{it.sku}</span>
                  <span style={{
                    color: 'var(--ws-text-3)', marginLeft: 6, fontSize: 11,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    display: 'inline-block', maxWidth: '60%', verticalAlign: 'middle',
                  }}>{it.desc}</span>
                </span>
                <span><BranchTag branch={it.branch} /></span>
                <span style={{ textAlign: 'right', color: 'var(--ws-text-3)', fontSize: 10, fontFamily: 'var(--ws-mono)' }}>
                  {it.onHand}/<span style={{ color: 'var(--ws-text-2)' }}>{it.weeklyUsage}wk</span>
                </span>
                <span style={{
                  textAlign: 'right',
                  color: it.dtz <= 2 ? '#e07b7b' : it.dtz <= 4 ? '#d4a23a' : 'var(--ws-text-2)',
                  fontWeight: 700, fontSize: 12, fontFamily: 'var(--ws-mono)',
                }}>{it.dtz}d</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Tile>
  );
}

function OverduePOsTile({ data, onDrill }: { data: OverduePOsFeed; onDrill: () => void }) {
  const accent = '#d4a23a';
  return (
    <Tile accent={accent} accentSoft="rgba(212,162,58,0.04)" dense drillLabel="View open POs" onDrill={onDrill}>
      <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
        POs past due
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--ws-text)', lineHeight: 1, letterSpacing: '-0.02em', fontFamily: 'var(--ws-mono)' }}>
          {data.count}
        </span>
        {data.value > 0 && (
          <span style={{ fontSize: 13, color: 'var(--ws-text-2)', fontWeight: 500, fontFamily: 'var(--ws-mono)' }}>{fmt$(data.value)}</span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <Delta value={data.deltaYesterday} dir={data.deltaDir} suffix="" />
        </span>
      </div>
      {data.top.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--ws-line-soft)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {data.top.slice(0, 4).map((p) => (
            <div key={p.po} style={{
              display: 'grid', gridTemplateColumns: '78px 1fr 30px 44px',
              gap: 6, alignItems: 'baseline', fontSize: 11.5,
            }}>
              <span style={{ color: '#4ec48a', fontWeight: 600, fontFamily: 'var(--ws-mono)' }}>{p.po}</span>
              <span style={{ color: 'var(--ws-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.vendor ?? '—'}</span>
              <BranchTag branch={p.branch} />
              <span style={{ textAlign: 'right', color: '#e07b7b', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap', fontFamily: 'var(--ws-mono)' }}>
                +{p.daysLate}d
              </span>
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}

function PendingCheckinsTile({ data, onDrill }: { data: PendingCheckinsFeed; onDrill: () => void }) {
  const accent = '#4a8fbf';
  return (
    <Tile accent={accent} accentSoft="rgba(74,143,191,0.04)" dense drillLabel="Open review queue" onDrill={onDrill}>
      <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
        Pending check-ins
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--ws-text)', lineHeight: 1, letterSpacing: '-0.02em', fontFamily: 'var(--ws-mono)' }}>
          {data.count}
        </span>
        {data.withDiscrepancy > 0 && (
          <span style={{
            fontFamily: 'var(--ws-mono)', fontSize: 10, fontWeight: 700,
            color: '#d4a23a', letterSpacing: '0.04em',
            padding: '1px 5px', borderRadius: 2,
            background: 'rgba(212,162,58,0.10)',
            border: '1px solid rgba(212,162,58,0.3)',
          }}>{data.withDiscrepancy} HIGH-PRI</span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <Delta value={data.deltaYesterday} dir={data.deltaDir} suffix="" />
        </span>
      </div>
      {data.top.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--ws-line-soft)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {data.top.slice(0, 4).map((s) => (
            <div key={s.id} style={{
              display: 'grid', gridTemplateColumns: '14px 78px 1fr 30px 40px',
              gap: 6, alignItems: 'baseline', fontSize: 11.5,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: s.discrepancy ? '#d4a23a' : 'var(--ws-text-4)',
              }} />
              <span style={{ color: '#4ec48a', fontWeight: 600, fontFamily: 'var(--ws-mono)' }}>{s.po}</span>
              <span style={{ color: 'var(--ws-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.vendor ?? '—'}</span>
              <BranchTag branch={s.branch} />
              <span style={{ textAlign: 'right', color: 'var(--ws-text-3)', fontSize: 10, fontFamily: 'var(--ws-mono)' }}>{s.age}</span>
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}

function POExceptionsTile({ data, onDrill }: { data: POExceptionsFeed; onDrill: () => void }) {
  const accent = '#8a6fb8';
  const byKind: [string, number][] = [
    ['no_receipt',     data.byKind.noReceipt],
    ['short_receive',  data.byKind.shortReceive],
    ['price_variance', data.byKind.priceVariance],
  ].filter(([, n]) => (n as number) > 0) as [string, number][];
  return (
    <Tile accent={accent} accentSoft="rgba(138,111,184,0.04)" dense drillLabel="Open exceptions" onDrill={onDrill}>
      <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
        PO exceptions · high severity
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--ws-text)', lineHeight: 1, letterSpacing: '-0.02em', fontFamily: 'var(--ws-mono)' }}>
          {data.count}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Delta value={data.deltaYesterday} dir={data.deltaDir} suffix="" />
        </span>
      </div>
      {byKind.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {byKind.map(([k, n]) => (
            <span key={k} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              height: 18, padding: '0 6px', borderRadius: 9,
              background: PO_EXC_KIND_COLOR[k] + '1f',
              border: '1px solid ' + PO_EXC_KIND_COLOR[k] + '55',
              fontSize: 10, fontFamily: 'var(--ws-mono)', color: 'var(--ws-text-2)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: PO_EXC_KIND_COLOR[k] }} />
              <span style={{ color: 'var(--ws-text)', fontWeight: 600 }}>{n}</span>
              <span>{PO_EXC_KIND_LABEL[k]}</span>
            </span>
          ))}
        </div>
      )}
      {data.top.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--ws-line-soft)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {data.top.slice(0, 3).map((e) => (
            <div key={`${e.po}-${e.kind}`} style={{
              display: 'grid', gridTemplateColumns: '6px 78px 1fr 30px',
              gap: 6, alignItems: 'start', fontSize: 11.5,
            }}>
              <span style={{ width: 4, height: 14, borderRadius: 1, marginTop: 2, background: PO_EXC_KIND_COLOR[e.kind] }} />
              <span style={{ color: '#4ec48a', fontWeight: 600, fontFamily: 'var(--ws-mono)' }}>{e.po}</span>
              <span style={{ color: 'var(--ws-text-3)', fontSize: 11, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.msg}</span>
              <BranchTag branch={e.branch} />
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}

function RecentMovementTile({ data, onDrill }: { data: RecentMovementFeed; onDrill: () => void }) {
  const accent = '#4ec48a';
  return (
    <Tile accent={accent} accentSoft="rgba(78,196,138,0.04)" dense drillLabel="View movement report" onDrill={onDrill}>
      <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
        Recent movement · vs 30-day
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--ws-text)', lineHeight: 1, letterSpacing: '-0.02em', fontFamily: 'var(--ws-mono)' }}>
          {data.total}
        </span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ color: '#4ec48a', fontSize: 11, fontWeight: 700, fontFamily: 'var(--ws-mono)' }}>▲ {data.upCount}</span>
          <span style={{ color: '#e07b7b', fontSize: 11, fontWeight: 700, fontFamily: 'var(--ws-mono)' }}>▼ {data.downCount}</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Delta value={data.deltaWeek} dir={data.deltaDir} suffix="" />
        </span>
      </div>
      {data.top.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--ws-line-soft)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {data.top.slice(0, 4).map((it) => {
            const up = it.dir === 'up';
            return (
              <div key={`${it.branch}-${it.sku}`} style={{
                display: 'grid', gridTemplateColumns: '10px 1fr 30px 42px',
                gap: 6, alignItems: 'baseline', fontSize: 11.5,
              }}>
                <span style={{ color: up ? '#4ec48a' : '#e07b7b', fontSize: 11, fontWeight: 700, fontFamily: 'var(--ws-mono)' }}>
                  {up ? '▲' : '▼'}
                </span>
                <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ color: 'var(--ws-text)', fontWeight: 600, fontSize: 11, fontFamily: 'var(--ws-mono)' }}>{it.sku}</span>
                  <span style={{ color: 'var(--ws-text-3)', marginLeft: 5, fontSize: 11 }}>{it.desc ?? ''}</span>
                  {it.note && (
                    <span style={{ color: 'var(--ws-text-4)', marginLeft: 5, fontSize: 10, fontStyle: 'italic' }}>· {it.note}</span>
                  )}
                </span>
                <BranchTag branch={it.branch} />
                <span style={{
                  textAlign: 'right', fontSize: 11, fontWeight: 700, fontFamily: 'var(--ws-mono)',
                  color: up ? '#4ec48a' : '#e07b7b',
                }}>{up ? '+' : ''}{it.pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </Tile>
  );
}

function QuickActions({
  onSKULookup, onVendor, onForecast, onItemPlanning, onPOCheckIn,
}: {
  onSKULookup: () => void; onVendor: () => void; onForecast: () => void;
  onItemPlanning: () => void; onPOCheckIn: () => void;
}) {
  type Item = { label: string; icon: React.ReactNode; hint?: string; onClick?: () => void; disabled?: boolean };
  const items: Item[] = [
    { label: 'PO Check-In',     icon: <Box      size={14} />, onClick: onPOCheckIn },
    { label: 'SKU lookup',      icon: <Search   size={14} />, onClick: onSKULookup, hint: '⌘K' },
    { label: 'Vendor scorecard',icon: <BarChart3 size={14} />, onClick: onVendor },
    { label: 'Forecast',        icon: <Calendar size={14} />, onClick: onForecast },
    { label: 'Item planning',   icon: <Cog      size={14} />, onClick: onItemPlanning, hint: 'Admin' },
    { label: 'New PO',          icon: <Plus     size={14} />, disabled: true, hint: 'Coming soon' },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 0,
      background: 'var(--ws-panel)', border: '1px solid var(--ws-line)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {items.map((a, i) => (
        <button
          key={a.label}
          onClick={a.disabled ? undefined : a.onClick}
          disabled={a.disabled}
          style={{
            padding: '12px 14px', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 10,
            borderRight: i < items.length - 1 ? '1px solid var(--ws-line)' : 'none',
            background: 'transparent', cursor: a.disabled ? 'not-allowed' : 'pointer',
            transition: 'background 100ms', opacity: a.disabled ? 0.45 : 1,
          }}
          onMouseEnter={(e) => { if (!a.disabled) e.currentTarget.style.background = 'var(--ws-panel-2)'; }}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{
            width: 28, height: 28, borderRadius: 4,
            background: 'var(--ws-panel-2)', border: '1px solid var(--ws-line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ws-text-2)',
          }}>{a.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text)' }}>{a.label}</div>
            {a.hint && <div style={{ fontSize: 10, color: 'var(--ws-text-3)', fontFamily: 'var(--ws-mono)' }}>{a.hint}</div>}
          </span>
        </button>
      ))}
    </div>
  );
}

// ====================================================================
// Scoped styles. The design uses a small set of CSS custom properties
// for colors + density; isolating them with `--ws-` prefixes keeps this
// page self-contained and avoids polluting the global theme.
// ====================================================================

function WorkspaceStyles() {
  return (
    <style jsx global>{`
      .ws-root {
        --ws-bg:        #0b1014;
        --ws-panel:     #131a20;
        --ws-panel-2:   #1a232b;
        --ws-panel-3:   #232f39;
        --ws-line:      #243038;
        --ws-line-soft: #1d262e;
        --ws-text:      #e6ecf0;
        --ws-text-2:    #aab7c2;
        --ws-text-3:    #6e7d89;
        --ws-text-4:    #4a5762;
        --ws-mono:      'JetBrains Mono', ui-monospace, monospace;
        background: var(--ws-bg);
        color: var(--ws-text);
        min-height: calc(100vh - 56px);
        font-size: 14px;
      }
      .ws-page-header {
        padding: 16px 20px 12px;
        border-bottom: 1px solid var(--ws-line);
        display: flex; align-items: center; justify-content: space-between;
        background: var(--ws-bg);
        gap: 12px; flex-wrap: wrap;
      }
      .ws-page-title { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; margin: 0; color: var(--ws-text); }
      .ws-breadcrumb {
        font-size: 12px; color: var(--ws-text-3); margin-bottom: 4px;
        display: flex; gap: 4px; align-items: center;
      }
      .ws-sep { margin: 0 4px; color: var(--ws-text-4); }
      .ws-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 10px; border-radius: 4px;
        background: var(--ws-panel-2); color: var(--ws-text);
        border: 1px solid var(--ws-line);
        font-size: 13px; font-weight: 500;
        transition: background 80ms, border-color 80ms;
        cursor: pointer;
      }
      .ws-btn:hover:not(:disabled) { background: var(--ws-panel-3); }
      .ws-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .ws-sticky {
        position: sticky; top: 52px; z-index: 30;
        background: var(--ws-bg);
        border-bottom: 1px solid var(--ws-line);
        padding: 10px 20px;
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      }
      .ws-seg {
        display: inline-flex; background: var(--ws-panel-2); border: 1px solid var(--ws-line);
        border-radius: 4px; padding: 2px;
      }
      .ws-seg button {
        padding: 4px 10px; font-size: 12px; color: var(--ws-text-2);
        border-radius: 3px; font-family: var(--ws-mono); font-weight: 500;
        display: inline-flex; align-items: center; gap: 5px;
        background: transparent; border: none; cursor: pointer;
      }
      .ws-seg button:disabled { opacity: 0.3; cursor: not-allowed; }
      .ws-seg button.active { background: var(--ws-panel-3); color: var(--ws-text); }
      .ws-asof {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px; height: 26px;
        border: 1px solid var(--ws-line); background: var(--ws-panel-2);
        border-radius: 13px; font-size: 11px; font-family: var(--ws-mono);
        color: var(--ws-text-3);
      }
      .ws-live-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #4ec48a; animation: ws-pulse 1.5s ease-in-out infinite;
      }
      @keyframes ws-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      .ws-error {
        margin: 16px 20px 0; padding: 10px 14px;
        background: rgba(208,80,80,0.10); border: 1px solid rgba(208,80,80,0.4);
        border-radius: 6px; color: #e07b7b; font-size: 13px;
      }
      .ws-loading {
        padding: 60px 20px; text-align: center;
        color: var(--ws-text-3); font-size: 13px;
      }
      .ws-content {
        padding: 14px 20px 32px; max-width: 1920px; margin: 0 auto;
      }
      .ws-hero {
        display: grid; gap: 12px; margin-bottom: 12px;
        grid-template-columns: 1fr 1fr;
      }
      .ws-secondary {
        display: grid; gap: 12px; margin-bottom: 12px;
        grid-template-columns: repeat(4, 1fr);
      }
      @media (max-width: 1280px) {
        .ws-hero      { grid-template-columns: 1fr; }
        .ws-secondary { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 720px) {
        .ws-secondary { grid-template-columns: 1fr; }
      }
      .ws-tile:focus-visible { outline: 2px solid #1f8a4f; outline-offset: 2px; }
      .spin { animation: ws-spin 0.9s linear infinite; }
      @keyframes ws-spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}

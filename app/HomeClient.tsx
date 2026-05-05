'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Truck, ShoppingCart, FileText, Ruler, Wrench,
  PackageCheck, ClipboardCheck, Settings,
  ArrowRight, Zap,
} from 'lucide-react';
import type { HomeData } from './api/home/route';
import { hasCapability } from '../src/lib/access-control-shared';
import type { Capability } from '../src/lib/access-control-shared';

const SO_STATUS: Record<string, { label: string; cls: string }> = {
  O: { label: 'Open',      cls: 'chip chip-open'    },
  B: { label: 'Open',      cls: 'chip chip-open'    },
  K: { label: 'Picking',   cls: 'chip chip-staged'  },
  P: { label: 'Pulled',    cls: 'chip chip-staged'  },
  S: { label: 'Staged',    cls: 'chip chip-staged'  },
  D: { label: 'Delivered', cls: 'chip chip-prog'    },
  I: { label: 'Invoiced',  cls: 'chip chip-done'    },
  C: { label: 'Closed',    cls: 'chip chip-done'    },
};

interface Props {
  userName: string | null;
  userRole: string | null;
  userBranch: string | null;
}

interface ModuleCard {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: ReactNode;
  kpiKey?: keyof HomeData['kpis'];
  kpiLabel?: string;
  accentColor: string;
  requiresCap?: readonly Capability[];
}

const MODULE_CARDS: ModuleCard[] = [
  {
    id: 'dispatch',
    label: 'Dispatch',
    description: 'Picks, work orders, dispatch & delivery tracking',
    href: '/warehouse',
    icon: <Truck className="w-5 h-5" />,
    kpiKey: 'openPicks',
    kpiLabel: 'open picks',
    accentColor: '#d4a23a',
    requiresCap: ['yard.view', 'picks.release', 'workorders.assign', 'pickers.manage', 'dispatch.view', 'dispatch.manage'],
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Orders, customers, transactions & reports',
    href: '/sales',
    icon: <ShoppingCart className="w-5 h-5" />,
    kpiKey: 'openOrders',
    kpiLabel: 'open orders',
    accentColor: '#4a8fbf',
    requiresCap: ['sales.view'],
  },
  {
    id: 'estimating',
    label: 'Estimating',
    description: 'PDF takeoff, bids, EWP & projects',
    href: '/legacy-bids',
    icon: <FileText className="w-5 h-5" />,
    kpiKey: 'openBids',
    kpiLabel: 'open bids',
    accentColor: '#1f8a4f',
    requiresCap: ['bids.manage', 'ewp.manage', 'projects.manage'],
  },
  {
    id: 'design',
    label: 'Design',
    description: 'Design orders & plan management',
    href: '/designs',
    icon: <Ruler className="w-5 h-5" />,
    kpiKey: 'openDesigns',
    kpiLabel: 'active',
    accentColor: '#8a6fb8',
    requiresCap: ['designs.manage'],
  },
  {
    id: 'service',
    label: 'Service',
    description: 'IT issues & internal service requests',
    href: '/it-issues',
    icon: <Wrench className="w-5 h-5" />,
    accentColor: '#d4885a',
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    description: 'Buyer workspace, open POs & command center',
    href: '/purchasing/workspace',
    icon: <PackageCheck className="w-5 h-5" />,
    accentColor: '#4ec48a',
    requiresCap: ['purchasing.view'],
  },
  {
    id: 'receiving',
    label: 'Receiving',
    description: 'PO check-in and review queue',
    href: '/purchasing',
    icon: <ClipboardCheck className="w-5 h-5" />,
    accentColor: '#6fb3d9',
    requiresCap: ['purchasing.receive', 'purchasing.review'],
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Users, audit log, ERP sync & configuration',
    href: '/admin',
    icon: <Settings className="w-5 h-5" />,
    accentColor: '#d05050',
    requiresCap: ['admin.users.manage', 'admin.config.manage', 'admin.audit.view', 'admin.jobs.review'],
  },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Tiny sparkline SVG — no axes, just the trend shape */
function Sparkline({ data, color = '#1f8a4f', height = 22 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return null;
  const w = 64;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function HomeClient({ userName, userRole, userBranch }: Props) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/home');
      if (res.ok) setData(await res.json() as HomeData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch('/api/track-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {});
  }, [pathname]);

  const visibleCards = MODULE_CARDS.filter(
    (m) => !m.requiresCap || hasCapability(session, ...m.requiresCap)
  );

  const kpis = data?.kpis;
  const firstName = userName?.split(' ')[0] ?? 'there';

  // Build sparkline: orders-per-day from the last 10 days in recentOrders
  const sparkData = useMemo(() => {
    if (!data?.recentOrders.length) return [];
    const counts: Record<string, number> = {};
    data.recentOrders.forEach((o: { created_date?: string | null }) => {
      const d = (o.created_date ?? '').slice(0, 10);
      if (d) counts[d] = (counts[d] ?? 0) + 1;
    });
    return Object.keys(counts).sort().slice(-10).map((d) => counts[d]);
  }, [data]);

  const kpiTiles = [
    { label: 'Open bids',          value: kpis?.openBids     ?? 0, href: '/legacy-bids',     color: '#1f8a4f', sub: 'active estimates' },
    { label: 'Open picks',         value: kpis?.openPicks     ?? 0, href: '/warehouse',        color: '#6fb3d9', sub: 'in yard queue' },
    { label: 'Open work orders',   value: kpis?.openWorkOrders ?? 0, href: '/work-orders',     color: '#c9a83f', sub: 'assigned WOs' },
    { label: 'Open POs',           value: 0,                         href: '/purchasing/open-pos', color: '#8a6fb8', sub: 'pending receipt' },
    { label: "Today's deliveries", value: kpis?.openOrders    ?? 0, href: '/dispatch',         color: '#d05050', sub: 'scheduled stops' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: 20 }}>

        {/* Greeting row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {mounted
                ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
                : ' '}
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em', color: 'var(--text)' }}>
              {mounted ? greeting() : 'Welcome'},{' '}
              <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{firstName}.</span>
            </h1>
            {userBranch && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 22, padding: '0 8px 0 6px', borderRadius: 11,
                  background: 'var(--branch-soft)',
                  border: '1px solid color-mix(in srgb, var(--branch) 35%, transparent)',
                  fontSize: 12, fontWeight: 500, color: 'var(--text)',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--branch)', flexShrink: 0 }} />
                  Operating from <strong style={{ marginLeft: 3 }}>{userBranch}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
          {kpiTiles.map((k) => (
            <Link key={k.label} href={k.href} style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                minHeight: 100,
                transition: 'border-color 100ms',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = k.color)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
              >
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontWeight: 600 }}>{k.label}</div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
                  {loading ? <span style={{ color: 'var(--text-4)' }}>—</span> : k.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{k.sub}</div>
                {!loading && sparkData.length > 1 && (
                  <div className="kpi-spark">
                    <Sparkline data={sparkData} color={k.color} height={22} />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* Quick access panel */}
        <div className="ds-panel" style={{ marginBottom: 16 }}>
          <div className="ds-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap style={{ width: 13, height: 13, color: 'var(--gold-bright)' }} />
              <span className="ds-panel-title">Quick access</span>
              <span className="ds-panel-sub">your most-visited pages this week</span>
            </div>
            <button style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Customize →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(data?.topPages.length || 5, 5)}, 1fr)` }}>
            {data && data.topPages.length > 0
              ? data.topPages.map((p, i) => (
                  <Link key={p.path} href={p.path} style={{ textDecoration: 'none' }}>
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRight: i < data.topPages.length - 1 ? '1px solid var(--line)' : 'none',
                        display: 'flex', flexDirection: 'column', gap: 4,
                        transition: 'background 80ms',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{p.label}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.path} · {p.visit_count} visits</div>
                    </div>
                  </Link>
                ))
              : ['Picks Board', 'Dispatch Board', 'Sales Hub', 'Open POs', 'Management'].map((label, i, arr) => (
                  <div key={label} style={{
                    padding: '14px 16px',
                    borderRight: i < arr.length - 1 ? '1px solid var(--line)' : 'none',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}>{label}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>tracking starts soon</div>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Modules + Activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 8 }}>
              Modules
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {visibleCards.map((card) => {
                const kpiVal = card.kpiKey ? kpis?.[card.kpiKey] : undefined;
                return (
                  <Link key={card.id} href={card.href} style={{ textDecoration: 'none' }}>
                    <div
                      style={{
                        background: 'var(--panel)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--r)',
                        padding: 14,
                        cursor: 'pointer',
                        transition: 'border-color 100ms, background 100ms',
                        position: 'relative',
                        overflow: 'hidden',
                        height: '100%',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = card.accentColor;
                        e.currentTarget.style.background = 'var(--panel-2)';
                        const bar = e.currentTarget.querySelector('.module-bar') as HTMLElement;
                        if (bar) bar.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--line)';
                        e.currentTarget.style.background = 'var(--panel)';
                        const bar = e.currentTarget.querySelector('.module-bar') as HTMLElement;
                        if (bar) bar.style.opacity = '0';
                      }}
                    >
                      {/* Left accent bar */}
                      <div className="module-bar" style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
                        background: card.accentColor, opacity: 0, transition: 'opacity 100ms',
                      }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 6,
                          background: 'var(--panel-2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: card.accentColor,
                          border: '1px solid var(--line)',
                          flexShrink: 0,
                        }}>
                          {card.icon}
                        </div>
                        {kpiVal != null && kpiVal > 0 && (
                          <span className="mono" style={{
                            marginLeft: 'auto', fontSize: 12, fontWeight: 600,
                            padding: '2px 8px', borderRadius: 10,
                            background: `${card.accentColor}20`,
                            border: `1px solid ${card.accentColor}50`,
                            color: card.accentColor,
                          }}>
                            {kpiVal}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, color: 'var(--text)' }}>{card.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{card.description}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Activity feed */}
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 8 }}>
              Activity feed
            </div>
            <div className="ds-panel" style={{ overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>Loading…</div>
              ) : data?.recentActivity?.length ? (
                data.recentActivity.map((a, i) => (
                  <Link key={a.id} href={a.href} style={{ textDecoration: 'none' }}>
                    <div style={{
                      padding: '10px 12px',
                      borderBottom: i < (data.recentActivity.length - 1) ? '1px solid var(--line-soft)' : 'none',
                      display: 'flex', gap: 10,
                      cursor: 'pointer',
                      transition: 'background 80ms',
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', width: 48, flexShrink: 0, paddingTop: 1 }}>
                        {relativeTime(a.timestamp)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>Bid #{a.bidId}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.action}</div>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>No recent activity</div>
              )}
            </div>
          </div>
        </div>

        {/* Recent orders */}
        {data && data.recentOrders.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontWeight: 600 }}>
                Recent Orders
                {data.branchScope && <span style={{ marginLeft: 8, color: 'var(--text-4)', fontWeight: 400 }}>· {data.branchScope}</span>}
              </div>
              <Link href="/sales/transactions" style={{ fontSize: 12, color: 'var(--green-bright)', textDecoration: 'none' }}>
                View all →
              </Link>
            </div>
            <div className="ds-panel" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>SO #</th>
                      <th>Customer</th>
                      <th>Reference</th>
                      <th>Status</th>
                      <th>Rep</th>
                      <th>Ordered</th>
                      <th>Need By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o) => {
                      const st = SO_STATUS[o.so_status ?? 'O'] ?? { label: o.so_status ?? '?', cls: 'chip chip-done' };
                      return (
                        <tr key={`${o.system_id}-${o.so_id}`}>
                          <td>
                            <Link href={`/sales/orders/${o.so_id}`} className="mono" style={{ color: 'var(--green-bright)', textDecoration: 'none', fontWeight: 500 }}>
                              {o.so_id}
                            </Link>
                          </td>
                          <td>
                            {o.cust_code ? (
                              <Link href={`/sales/customers/${o.cust_code}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                                {o.cust_name ?? o.cust_code}
                              </Link>
                            ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                          </td>
                          <td style={{ color: 'var(--text-2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.reference ?? '—'}</td>
                          <td><span className={st.cls}>{st.label}</span></td>
                          <td style={{ color: 'var(--text-3)' }}>{o.salesperson ?? '—'}</td>
                          <td className="mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>{o.created_date?.slice(0, 10) ?? '—'}</td>
                          <td className="mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>{o.expect_date?.slice(0, 10) ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

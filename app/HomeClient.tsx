'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Truck, ShoppingCart, FileText, Ruler, Wrench,
  PackageCheck, ClipboardCheck, Settings,
  ArrowRight, Activity, Zap,
} from 'lucide-react';
import type { HomeData } from './api/home/route';

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
  icon: React.ReactNode;
  kpiKey?: keyof HomeData['kpis'];
  kpiLabel?: string;
  accent: string;       // Tailwind color class fragments (border, icon, badge)
  adminOnly?: boolean;
}

const MODULE_CARDS: ModuleCard[] = [
  {
    id: 'dispatch',
    label: 'Dispatch',
    description: 'Picks, work orders, dispatch & delivery tracking',
    href: '/warehouse',
    icon: <Truck className="w-6 h-6" />,
    kpiKey: 'openPicks',
    kpiLabel: 'open picks',
    accent: 'yellow',
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Orders, customers, transactions & reports',
    href: '/sales',
    icon: <ShoppingCart className="w-6 h-6" />,
    kpiKey: 'openOrders',
    kpiLabel: 'open orders',
    accent: 'blue',
  },
  {
    id: 'estimating',
    label: 'Estimating',
    description: 'PDF takeoff, bids, EWP & projects',
    href: '/legacy-bids',
    icon: <FileText className="w-6 h-6" />,
    kpiKey: 'openBids',
    kpiLabel: 'open bids',
    accent: 'cyan',
  },
  {
    id: 'design',
    label: 'Design',
    description: 'Design orders & plan management',
    href: '/designs',
    icon: <Ruler className="w-6 h-6" />,
    kpiKey: 'openDesigns',
    kpiLabel: 'active',
    accent: 'purple',
  },
  {
    id: 'service',
    label: 'Service',
    description: 'IT issues & internal service requests',
    href: '/it-issues',
    icon: <Wrench className="w-6 h-6" />,
    accent: 'orange',
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    description: 'Buyer workspace, open POs & command center',
    href: '/purchasing/workspace',
    icon: <PackageCheck className="w-6 h-6" />,
    accent: 'green',
  },
  {
    id: 'receiving',
    label: 'Receiving',
    description: 'PO check-in and review queue',
    href: '/purchasing',
    icon: <ClipboardCheck className="w-6 h-6" />,
    accent: 'indigo',
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Users, audit log, ERP sync & configuration',
    href: '/admin',
    icon: <Settings className="w-6 h-6" />,
    accent: 'red',
    adminOnly: true,
  },
];

const ACCENT: Record<string, { border: string; icon: string; badge: string; card: string }> = {
  yellow: {
    border: 'border-yellow-500/30 hover:border-yellow-400/60',
    icon:   'text-yellow-400',
    badge:  'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
    card:   'hover:bg-yellow-500/5',
  },
  blue: {
    border: 'border-blue-500/30 hover:border-blue-400/60',
    icon:   'text-blue-400',
    badge:  'bg-blue-900/50 text-blue-300 border-blue-700/50',
    card:   'hover:bg-blue-500/5',
  },
  cyan: {
    border: 'border-cyan-500/30 hover:border-cyan-400/60',
    icon:   'text-cyan-400',
    badge:  'bg-cyan-900/50 text-cyan-300 border-cyan-700/50',
    card:   'hover:bg-cyan-500/5',
  },
  purple: {
    border: 'border-purple-500/30 hover:border-purple-400/60',
    icon:   'text-purple-400',
    badge:  'bg-purple-900/50 text-purple-300 border-purple-700/50',
    card:   'hover:bg-purple-500/5',
  },
  orange: {
    border: 'border-orange-500/30 hover:border-orange-400/60',
    icon:   'text-orange-400',
    badge:  'bg-orange-900/50 text-orange-300 border-orange-700/50',
    card:   'hover:bg-orange-500/5',
  },
  green: {
    border: 'border-green-500/30 hover:border-green-400/60',
    icon:   'text-green-400',
    badge:  'bg-green-900/50 text-green-300 border-green-700/50',
    card:   'hover:bg-green-500/5',
  },
  indigo: {
    border: 'border-indigo-500/30 hover:border-indigo-400/60',
    icon:   'text-indigo-400',
    badge:  'bg-indigo-900/50 text-indigo-300 border-indigo-700/50',
    card:   'hover:bg-indigo-500/5',
  },
  red: {
    border: 'border-red-500/30 hover:border-red-400/60',
    icon:   'text-red-400',
    badge:  'bg-red-900/50 text-red-300 border-red-700/50',
    card:   'hover:bg-red-500/5',
  },
};

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

export default function HomeClient({ userName, userRole, userBranch }: Props) {
  const pathname = usePathname();
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

  // Track this page visit
  useEffect(() => {
    fetch('/api/track-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {});
  }, [pathname]);

  const visibleCards = MODULE_CARDS.filter(
    (m) => !m.adminOnly || userRole === 'admin'
  );

  const kpis = data?.kpis;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Welcome header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {mounted ? greeting() : 'Welcome'}{userName ? `, ${userName.split(' ')[0]}` : ''}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              {mounted
                ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                : <span className="invisible">—</span>}
              {userBranch && <span className="ml-2 text-gray-600">· {userBranch}</span>}
            </p>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiTile
            label="Open Bids"
            value={loading ? null : (kpis?.openBids ?? 0)}
            href="/legacy-bids"
            color="cyan"
          />
          <KpiTile
            label="Open Designs"
            value={loading ? null : (kpis?.openDesigns ?? 0)}
            href="/designs"
            color="purple"
          />
          <KpiTile
            label="Open Picks"
            value={loading ? null : (kpis?.openPicks ?? 0)}
            href="/warehouse"
            color="yellow"
          />
          <KpiTile
            label="Open Work Orders"
            value={loading ? null : (kpis?.openWorkOrders ?? 0)}
            href="/work-orders"
            color="orange"
          />
          <KpiTile
            label="Open Orders"
            value={loading ? null : (kpis?.openOrders ?? 0)}
            href="/sales"
            color="blue"
          />
        </div>

        {/* Quick access — shown only when visit data exists */}
        {data && data.topPages.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Quick Access</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.topPages.map((p) => (
                <Link
                  key={p.path}
                  href={p.path}
                  className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-cyan-500/50 transition-colors"
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Module cards */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleCards.map((card) => {
              const a = ACCENT[card.accent];
              const kpiVal = card.kpiKey ? kpis?.[card.kpiKey] : undefined;
              return (
                <Link
                  key={card.id}
                  href={card.href}
                  className={`group relative bg-gray-900 border ${a.border} ${a.card} rounded-xl p-5 transition-all duration-150`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`${a.icon}`}>{card.icon}</div>
                    {kpiVal != null && kpiVal > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${a.badge}`}>
                        {kpiVal}
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-white text-base mb-1">{card.label}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{card.description}</div>
                  <ArrowRight className="absolute bottom-4 right-4 w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Recent Activity</h2>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-600">Loading…</div>
            ) : data?.recentActivity.length ? (
              <div className="divide-y divide-gray-800">
                {data.recentActivity.map((a) => (
                  <Link
                    key={a.id}
                    href={a.href}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors group"
                  >
                    <div className="text-sm">
                      <span className="text-gray-500">Bid #{a.bidId} </span>
                      <span className="text-gray-300">{a.action}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>{relativeTime(a.timestamp)}</span>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-600">No recent activity</div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}

function KpiTile({
  label, value, href, color,
}: {
  label: string;
  value: number | null;
  href: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    cyan:   'border-cyan-500/30 text-cyan-300',
    purple: 'border-purple-500/30 text-purple-300',
    yellow: 'border-yellow-500/30 text-yellow-300',
    orange: 'border-orange-500/30 text-orange-300',
    blue:   'border-blue-500/30 text-blue-300',
  };
  const cls = colors[color] ?? colors.cyan;

  return (
    <Link href={href}
      className={`bg-gray-900 border ${cls} rounded-xl px-4 py-3 hover:bg-gray-800/60 transition-colors`}>
      <div className="text-xs text-gray-500 font-medium mb-1 truncate">{label}</div>
      <div className={`text-2xl font-bold ${cls.split(' ')[1]}`}>
        {value === null ? <span className="text-gray-700 text-base">…</span> : value}
      </div>
    </Link>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  LogOut, ChevronDown, Menu, X, Settings,
  Search, Wrench, HelpCircle, User, Bell, Mail,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { hasCapability } from '../../lib/access-control-shared';
import type { Capability } from '../../lib/access-control-shared';

// ─── Branch switcher ──────────────────────────────────────────────────────────

const BRANCH_OPTIONS = [
  { code: '',     label: 'All Branches' },
  { code: '10FD', label: '10FD · Fort Dodge' },
  { code: '20GR', label: '20GR · Grimes' },
  { code: '25BW', label: '25BW · Birchwood' },
  { code: '40CV', label: '40CV · Coralville' },
] as const;

const BRANCH_COLORS: Record<string, { btn: string; dot: string; active: string }> = {
  '':    { btn: 'bg-violet-900/30 text-violet-300 hover:bg-violet-900/50', dot: 'bg-violet-300',  active: 'bg-violet-500/20 text-violet-200' },
  '10FD': { btn: 'bg-red-900/40   text-red-300    hover:bg-red-900/60',    dot: 'bg-red-500',    active: 'bg-red-500/20    text-red-300'    },
  '20GR': { btn: 'bg-cyan-900/40  text-cyan-300   hover:bg-cyan-900/60',   dot: 'bg-cyan-400',   active: 'bg-cyan-500/20   text-cyan-300'   },
  '25BW': { btn: 'bg-gold-800/40  text-gold-300   hover:bg-gold-800/60',   dot: 'bg-gold-400',   active: 'bg-gold-500/20   text-gold-300'   },
  '40CV': { btn: 'bg-slate-800    text-slate-200  hover:bg-slate-700',     dot: 'bg-slate-100',  active: 'bg-slate-700     text-white'       },
};

function readBranchCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)beisser-branch=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function BranchSwitcher() {
  const router = useRouter();
  const [current, setCurrent] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const branch = readBranchCookie();
    setCurrent(branch);
    document.body.dataset.branch = branch;
  }, []);

  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function select(code: string) {
    setOpen(false);
    if (code === current) return;
    setSaving(true);
    try {
      await fetch('/api/auth/set-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchCode: code }),
      });
      setCurrent(code);
      document.body.dataset.branch = code;
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const label = BRANCH_OPTIONS.find((b) => b.code === current)?.label ?? 'All Branches';
  const shortLabel = current || 'All';
  const colors = BRANCH_COLORS[current] ?? BRANCH_COLORS[''];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        disabled={saving}
        title={label}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition',
          colors.btn
        )}
      >
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', colors.dot)} />
        {saving ? '…' : shortLabel}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 min-w-[200px] bg-slate-900 border border-white/10 rounded-lg shadow-2xl shadow-black/50 overflow-hidden z-50 py-1">
          {BRANCH_OPTIONS.map((b) => {
            const bc = BRANCH_COLORS[b.code] ?? BRANCH_COLORS[''];
            const isActive = b.code === current;
            return (
              <button
                key={b.code}
                onClick={() => select(b.code)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition',
                  isActive ? bc.active : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', bc.dot)} />
                {b.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type InlineResult = {
  type: 'so' | 'customer' | 'work_order' | 'picker' | 'item';
  title: string;
  subtitle: string;
  url: string;
  meta?: string;
};

const INLINE_GROUPS: Array<{ type: InlineResult['type']; label: string }> = [
  { type: 'customer',   label: 'Customers'   },
  { type: 'item',       label: 'Items'       },
  { type: 'so',         label: 'Orders'      },
  { type: 'work_order', label: 'Work Orders' },
  { type: 'picker',     label: 'Pickers'     },
];

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<InlineResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur();
          setQ('');
        }
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } catch { /* ignore */ }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    setQ('');
    inputRef.current?.blur();
  }

  const grouped = results.reduce<Record<string, InlineResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={submit} className="flex items-center gap-1.5 h-[28px] px-2.5 bg-slate-800/60 border border-white/10 rounded-md min-w-[200px] max-w-xs focus-within:border-cyan-500/50 transition">
        <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search orders, customers, SKUs…"
          className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-200 placeholder-slate-500 focus:outline-none"
        />
        <span className="text-[10px] font-mono text-slate-500 border border-slate-700 rounded px-1 leading-none py-0.5 hidden lg:inline">⌘K</span>
      </form>

      {open && results.length > 0 && (
        <div className="absolute left-0 top-full mt-1.5 w-[360px] bg-slate-900 border border-white/10 rounded-lg shadow-2xl shadow-black/60 z-[60] overflow-hidden">
          {INLINE_GROUPS.map(({ type, label }) => {
            const group = grouped[type];
            if (!group?.length) return null;
            return (
              <div key={type}>
                <div className="px-3 pt-2.5 pb-1 border-t border-white/5 first:border-t-0">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</span>
                </div>
                {group.slice(0, 3).map((r, i) => (
                  <Link
                    key={i}
                    href={r.url}
                    onClick={() => { setOpen(false); setQ(''); }}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-800 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">{r.title}</div>
                      <div className="text-[11px] text-slate-400 truncate">{r.subtitle}</div>
                    </div>
                    {r.meta && (
                      <span className="text-[11px] text-slate-500 flex-shrink-0 whitespace-nowrap">{r.meta}</span>
                    )}
                  </Link>
                ))}
              </div>
            );
          })}
          <Link
            href={`/search?q=${encodeURIComponent(q.trim())}`}
            onClick={() => { setOpen(false); setQ(''); }}
            className="flex items-center justify-center py-2.5 text-[12px] text-slate-400 hover:text-white border-t border-white/8 hover:bg-slate-800/50 transition"
          >
            See all {results.length} results →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Nav structure ────────────────────────────────────────────────────────────

interface NavLink {
  href: string;
  label: string;
  requiresCap?: readonly Capability[];
  sectionBefore?: string;
}

interface Domain {
  id: string;
  label: string;
  links: NavLink[];
  isActive: (p: string) => boolean;
  dropdown: boolean;
  href?: string;
  hubHref?: string;
  requiresCap: readonly Capability[];
}

function getDomains(tvBranch: string): Domain[] {
  return [
    {
      id: 'yard',
      label: 'Yard',
      dropdown: true,
      requiresCap: ['yard.view', 'picks.release', 'workorders.assign', 'pickers.manage'],
      isActive: (p) =>
        ['/warehouse', '/work-orders', '/supervisor'].some(
          (prefix) => p === prefix || p.startsWith(prefix + '/')
        ) || p.startsWith('/tv/') || p.startsWith('/kiosk/'),
      links: [
        { href: '/warehouse',              label: 'Picks Board' },
        { href: '/warehouse/open-picks',   label: 'Open Picks' },
        { href: '/work-orders',            label: 'Work Orders' },
        { href: '/warehouse/picker-stats', label: 'Picker Stats',       sectionBefore: 'Performance' },
        { href: '/supervisor',             label: 'Supervisor',         requiresCap: ['pickers.manage', 'workorders.assign'] },
        { href: `/tv/${tvBranch}`,         label: 'TV Board',           sectionBefore: 'Kiosks', requiresCap: ['pickers.manage', 'workorders.assign'] },
        { href: `/kiosk/${tvBranch}`,      label: 'Pick Tracker Kiosk', requiresCap: ['pickers.manage', 'workorders.assign'] },
      ],
    },
    {
      id: 'dispatch',
      label: 'Dispatch',
      dropdown: true,
      requiresCap: ['dispatch.view', 'dispatch.manage'],
      isActive: (p) =>
        ['/dispatch', '/delivery'].some((prefix) => p === prefix || p.startsWith(prefix + '/')) ||
        p.startsWith('/ops/delivery') ||
        p === '/management/forecast',
      links: [
        { href: '/dispatch',               label: 'Dispatch Board' },
        { href: '/dispatch/transfers',     label: 'Branch Transfers' },
        { href: '/dispatch/drivers',       label: 'Driver Roster',   requiresCap: ['dispatch.manage'] },
        { href: '/delivery',               label: 'Delivery Tracker' },
        { href: '/delivery/map',           label: 'Fleet Map' },
        { href: '/ops/delivery-reporting', label: 'Delivery Report', sectionBefore: 'Reports', requiresCap: ['dispatch.manage'] },
        { href: '/management/forecast',    label: 'Delivery Forecast' },
      ],
    },
    {
      id: 'sales',
      label: 'Sales',
      dropdown: true,
      hubHref: '/sales',
      requiresCap: ['sales.view', 'credits.view', 'credits.manage', 'hubbell.review'],
      isActive: (p) =>
        (p.startsWith('/sales') && !p.startsWith('/sales/reports')) ||
        p.startsWith('/credits') ||
        p.startsWith('/admin/hubbell'),
      links: [
        { href: '/sales/customers',     label: 'Customers',        requiresCap: ['sales.view'] },
        { href: '/sales/transactions',  label: 'Transactions',     requiresCap: ['sales.view'] },
        { href: '/sales/products',      label: 'Products & Stock', requiresCap: ['sales.view'] },
        { href: '/sales/tracker',       label: 'Sales Tracker',    requiresCap: ['sales.view'] },
        { href: '/credits',             label: 'RMA Credits',      requiresCap: ['credits.view', 'credits.manage'] },
        { href: '/admin/hubbell',       label: 'Hubbell Emails',   sectionBefore: 'Vendor Reconciliation', requiresCap: ['hubbell.review'] },
        { href: '/admin/hubbell/jobs',  label: 'Hubbell Jobs',     requiresCap: ['hubbell.review'] },
      ],
    },
    {
      id: 'management',
      label: 'MGMT',
      dropdown: true,
      hubHref: '/management',
      requiresCap: ['branch.all'],
      isActive: (p) =>
        p.startsWith('/management') || p.startsWith('/sales/reports') || p.startsWith('/scorecard'),
      links: [
        { href: '/scorecard/overview',    label: 'Company Overview' },
        { href: '/scorecard/branch/20GR', label: 'By Branch' },
        { href: '/scorecard/rep',         label: 'By Sales Rep' },
        { href: '/scorecard/product',     label: 'Product Groups' },
        { href: '/scorecard',             label: 'Customer Scorecard' },
        { href: '/sales/reports',         label: 'Sales Reports' },
        { href: '/management/forecast',   label: 'Open Orders & Forecast' },
        { href: '/purchasing/scorecard',  label: 'Vendor Scorecard',  sectionBefore: 'Purchasing', requiresCap: ['purchasing.view'] },
        { href: '/management/rebates',    label: 'Rebate Rules',      requiresCap: ['purchasing.view'] },
      ],
    },
    {
      id: 'estimating',
      label: 'Services',
      dropdown: true,
      requiresCap: ['bids.manage', 'designs.manage', 'ewp.manage', 'projects.manage'],
      isActive: (p) =>
        p === '/estimating' ||
        p.startsWith('/estimating/') ||
        p.startsWith('/takeoff') ||
        p.startsWith('/legacy-bids') ||
        p.startsWith('/all-bids') ||
        p.startsWith('/bids') ||
        p.startsWith('/ewp') ||
        p.startsWith('/projects') ||
        p.startsWith('/designs'),
      links: [
        { href: '/estimating', label: 'Estimating App', requiresCap: ['bids.manage'] },
        { href: '/takeoff',    label: 'PDF Takeoff',    requiresCap: ['branch.all'] },
        { href: '/bids',       label: 'Bids',           requiresCap: ['bids.manage'] },
        { href: '/ewp',        label: 'EWP',            requiresCap: ['ewp.manage'] },
        { href: '/projects',   label: 'Projects',       requiresCap: ['projects.manage'] },
        { href: '/designs',    label: 'Design',         requiresCap: ['designs.manage'] },
      ],
    },
    {
      id: 'purchasing',
      label: 'Purchasing',
      dropdown: true,
      requiresCap: ['purchasing.view', 'purchasing.receive', 'purchasing.review'],
      isActive: (p) =>
        p.startsWith('/purchasing/workspace') ||
        p.startsWith('/purchasing/open-pos') ||
        p.startsWith('/purchasing/suggested-buys') ||
        p.startsWith('/purchasing/exceptions') ||
        p.startsWith('/purchasing/manage') ||
        p.startsWith('/purchasing/pos') ||
        p.startsWith('/purchasing/review') ||
        p === '/purchasing',
      links: [
        { href: '/purchasing/workspace',      label: 'Buyer Workspace', requiresCap: ['purchasing.view'] },
        { href: '/purchasing/open-pos',       label: 'Open POs',        requiresCap: ['purchasing.view'] },
        { href: '/purchasing/suggested-buys', label: 'Suggested Buys',  requiresCap: ['purchasing.view'] },
        { href: '/purchasing/exceptions',     label: 'Exceptions',      requiresCap: ['purchasing.view'] },
        { href: '/purchasing/manage',         label: 'Command Center',  requiresCap: ['purchasing.view'] },
        { href: '/purchasing',        label: 'PO Check-In',  sectionBefore: 'Receiving', requiresCap: ['purchasing.receive'] },
        { href: '/purchasing/review', label: 'Review Queue', requiresCap: ['purchasing.review'] },
      ],
    },
  ];
}

interface AdminLink {
  href: string;
  label: string;
  sectionBefore?: string;
  requiresCap: readonly Capability[];
}

const ADMIN_LINKS: AdminLink[] = [
  { href: '/admin',               label: 'Dashboard',       requiresCap: ['admin.users.manage', 'admin.config.manage', 'admin.audit.view', 'admin.jobs.review', 'admin.products.view', 'admin.customers.view', 'hubbell.review'] },
  { href: '/admin/customers',     label: 'Customers',       sectionBefore: 'General',     requiresCap: ['admin.customers.view', 'admin.config.manage'] },
  { href: '/admin/products',      label: 'Products / SKUs',                               requiresCap: ['admin.products.view', 'admin.config.manage'] },
  { href: '/admin/formulas',      label: 'Formulas',                                      requiresCap: ['admin.config.manage'] },
  { href: '/admin/bid-fields',    label: 'Bid Fields',      sectionBefore: 'Services',    requiresCap: ['admin.config.manage'] },
  { href: '/admin/users',         label: 'Users',           sectionBefore: 'Users',       requiresCap: ['admin.users.manage'] },
  { href: '/warehouse/pickers',   label: 'Picker Admin',                                  requiresCap: ['pickers.manage', 'admin.config.manage'] },
  { href: '/admin/notifications', label: 'Notifications',                                 requiresCap: ['admin.config.manage'] },
  { href: '/admin/jobs',          label: 'Job Review',      sectionBefore: 'Operations',  requiresCap: ['admin.jobs.review'] },
  { href: '/admin/hubbell',       label: 'Hubbell Emails',                                requiresCap: ['hubbell.review'] },
  { href: '/admin/hubbell/jobs',  label: 'Hubbell Jobs',                                  requiresCap: ['hubbell.review'] },
  { href: '/admin/audit',         label: 'Audit Log',       sectionBefore: 'System',      requiresCap: ['admin.audit.view'] },
  { href: '/admin/erp',           label: 'ERP Sync',                                      requiresCap: ['admin.config.manage'] },
  { href: '/admin/analytics',     label: 'Page Analytics',                                requiresCap: ['admin.config.manage'] },
];

interface Props {
  userName?: string | null;
  userRole?: string;
}

export function TopNav({ userName, userRole }: Props) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const helpHref = `/help?from=${encodeURIComponent(pathname || '/')}`;
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobileOpenSections, setMobileOpenSections] = React.useState<Set<string>>(new Set());
  const [tvBranch, setTvBranch] = React.useState('20GR');
  const navRef = React.useRef<HTMLElement>(null);

  const name: string = session?.user?.name ?? userName ?? 'User';
  const signOutUrl = '/login';

  React.useEffect(() => {
    const branch = readBranchCookie();
    if (branch) setTvBranch(branch);
  }, []);

  const DOMAINS = getDomains(tvBranch);

  const visibleDomains = DOMAINS
    .filter((d) => hasCapability(session, ...d.requiresCap))
    .map((d) => ({
      ...d,
      links: d.links.filter((l) => !l.requiresCap || hasCapability(session, ...l.requiresCap)),
    }));

  const adminLinks = ADMIN_LINKS.filter((l) => hasCapability(session, ...l.requiresCap));
  const showAdmin = adminLinks.length > 0;

  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  React.useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
    setMobileOpenSections(new Set());
  }, [pathname]);

  const toggle = (id: string) => setOpenMenu((prev) => (prev === id ? null : id));

  function toggleMobileSection(id: string) {
    setMobileOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderDropdownLink(l: NavLink | AdminLink) {
    const isCurrentPath =
      pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href + '/'));
    return (
      <React.Fragment key={l.href}>
        {l.sectionBefore && (
          <div className="px-3 pt-3 pb-1">
            <div className="border-t border-white/8 mb-2" />
            <span className="text-[10px] uppercase tracking-[0.08em] text-slate-500 font-semibold">
              {l.sectionBefore}
            </span>
          </div>
        )}
        <Link
          href={l.href}
          onClick={() => setOpenMenu(null)}
          className={cn(
            'flex items-center justify-between px-3 py-2 text-[13px] transition whitespace-nowrap rounded mx-1',
            isCurrentPath
              ? 'bg-cyan-500/15 text-cyan-400'
              : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
          )}
        >
          {l.label}
        </Link>
      </React.Fragment>
    );
  }

  return (
    <>
      <nav
        ref={navRef}
        className="sticky top-2 z-50 bg-slate-950/90 border-b border-white/10 backdrop-blur-sm print:hidden"
      >
        <div className="max-w-screen-2xl mx-auto px-4 flex items-center justify-between h-[52px]">

          <div className="flex items-center gap-1">
            <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 mr-3">
              <span className="flex items-center justify-center w-8 h-8 bg-white rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                <img
                  src="/icons/beisser_B_full_color_RGB.png"
                  alt="Beisser"
                  className="w-full h-full object-cover"
                />
              </span>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-[9px] text-slate-400 font-normal tracking-widest uppercase leading-none">
                  Beisser Lumber
                </span>
                <span className="text-base font-bold leading-none text-white">
                  Live<span className="text-cyan-400">Edge</span>
                </span>
              </div>
            </Link>

            <div className="hidden lg:flex items-center gap-0.5">
              <GlobalSearch />
              <div className="w-px h-5 bg-slate-700 mx-1.5" />
              {visibleDomains.map((domain) => {
                const active = domain.isActive(pathname);
                const baseCls = cn(
                  'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition',
                  active
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                );

                if (!domain.dropdown) {
                  return (
                    <Link key={domain.id} href={domain.href!} className={baseCls}>
                      {domain.label}
                    </Link>
                  );
                }

                if (domain.hubHref) {
                  const activeCls = active
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800';
                  return (
                    <div key={domain.id} className="relative flex items-center">
                      <Link
                        href={domain.hubHref}
                        className={cn('flex items-center px-3 py-2 rounded-lg text-sm font-medium transition', activeCls)}
                      >
                        {domain.label}
                      </Link>
                      <button
                        onClick={() => toggle(domain.id)}
                        className={cn('flex items-center px-1.5 py-2 rounded-lg transition', activeCls)}
                      >
                        <ChevronDown
                          className={cn('w-3 h-3 transition-transform', openMenu === domain.id && 'rotate-180')}
                        />
                      </button>
                      {openMenu === domain.id && (
                        <div className="absolute left-0 top-full mt-1 min-w-[200px] bg-slate-900 border border-white/10 rounded-lg shadow-2xl shadow-black/50 overflow-hidden z-50 py-1">
                          {domain.links.map((l) => renderDropdownLink(l))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={domain.id} className="relative">
                    <button onClick={() => toggle(domain.id)} className={baseCls}>
                      <span>{domain.label}</span>
                      <ChevronDown
                        className={cn('w-3 h-3 transition-transform', openMenu === domain.id && 'rotate-180')}
                      />
                    </button>
                    {openMenu === domain.id && (
                      <div className="absolute left-0 mt-1 min-w-[200px] bg-slate-900 border border-white/10 rounded-lg shadow-2xl shadow-black/50 overflow-hidden z-50 py-1">
                        {domain.links.map((l) => renderDropdownLink(l))}
                      </div>
                    )}
                  </div>
                );
              })}

              {showAdmin && (
                <div className="relative">
                  <button
                    onClick={() => toggle('admin')}
                    className={cn(
                      'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition',
                      pathname.startsWith('/admin')
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    )}
                  >
                    <span>Admin</span>
                    <ChevronDown
                      className={cn('w-3 h-3 transition-transform', openMenu === 'admin' && 'rotate-180')}
                    />
                  </button>
                  {openMenu === 'admin' && (
                    <div className="absolute left-0 mt-1 min-w-[200px] bg-slate-900 border border-white/10 rounded-lg shadow-2xl shadow-black/50 overflow-hidden z-50 py-1">
                      {adminLinks.map((l) => renderDropdownLink(l))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <BranchSwitcher />

            <button
              className="relative hidden sm:flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
            </button>

            <div className="relative hidden sm:block pl-2 border-l border-slate-700">
              <button
                onClick={() => toggle('user')}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                <User className="w-4 h-4 text-slate-400" />
                <span className="max-w-[120px] truncate">{name}</span>
                <ChevronDown
                  className={cn('w-3 h-3 transition-transform', openMenu === 'user' && 'rotate-180')}
                />
              </button>
              {openMenu === 'user' && (
                <div className="absolute right-0 mt-1 min-w-[210px] bg-slate-900 border border-white/10 rounded-lg shadow-2xl shadow-black/50 overflow-hidden z-50">
                  <div className="px-3 py-3 border-b border-white/8">
                    <p className="text-[13px] font-semibold text-white truncate">{name}</p>
                    {userRole && (
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/it-issues?report=1&from=${encodeURIComponent(pathname)}`}
                    onClick={() => setOpenMenu(null)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Wrench className="w-4 h-4 flex-shrink-0" />
                    Report an Issue
                  </Link>
                  <Link
                    href={helpHref}
                    onClick={() => setOpenMenu(null)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <HelpCircle className="w-4 h-4 flex-shrink-0" />
                    Help &amp; Docs
                  </Link>
                  <Link
                    href="/account/subscriptions"
                    onClick={() => setOpenMenu(null)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Mail className="w-4 h-4 flex-shrink-0" />
                    Email Subscriptions
                  </Link>
                  <div className="border-t border-slate-700/50 my-1" />
                  <button
                    onClick={() => signOut({ callbackUrl: signOutUrl })}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-red-400 transition"
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col print:hidden">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative mt-14 bg-slate-900 border-b border-white/10 shadow-xl overflow-y-auto max-h-[calc(100vh-3.5rem)]">
            <div className="px-4 py-3 space-y-0.5">

              <div className="pb-2">
                <GlobalSearch />
              </div>
              <div className="border-t border-slate-800 my-1" />

              {visibleDomains.map((domain) => {
                const sectionOpen = mobileOpenSections.has(domain.id);

                if (!domain.dropdown) {
                  return (
                    <Link
                      key={domain.id}
                      href={domain.href!}
                      className={cn(
                        'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition',
                        domain.isActive(pathname)
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      )}
                    >
                      {domain.label}
                    </Link>
                  );
                }

                if (domain.hubHref) {
                  return (
                    <React.Fragment key={domain.id}>
                      <div className="flex items-center">
                        <Link
                          href={domain.hubHref}
                          className={cn(
                            'flex-1 flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold transition',
                            domain.isActive(pathname)
                              ? 'text-cyan-400'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          )}
                        >
                          {domain.label}
                        </Link>
                        <button
                          onClick={() => toggleMobileSection(domain.id)}
                          className={cn(
                            'flex items-center px-3 py-2.5 rounded-lg transition',
                            domain.isActive(pathname)
                              ? 'text-cyan-400'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          )}
                        >
                          <ChevronDown
                            className={cn('w-4 h-4 transition-transform', sectionOpen && 'rotate-180')}
                          />
                        </button>
                      </div>
                      {sectionOpen && (
                        <div className="ml-4 border-l border-slate-700 pl-3 pb-1 space-y-0.5">
                          {domain.links.map((l) => (
                            <React.Fragment key={l.href}>
                              {l.sectionBefore && (
                                <div className="pt-2 pb-0.5">
                                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                                    {l.sectionBefore}
                                  </span>
                                </div>
                              )}
                              <Link
                                href={l.href}
                                className={cn(
                                  'flex items-center px-3 py-2 rounded-lg text-sm transition',
                                  pathname === l.href
                                    ? 'bg-cyan-500/20 text-cyan-400'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                )}
                              >
                                {l.label}
                              </Link>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={domain.id}>
                    <button
                      onClick={() => toggleMobileSection(domain.id)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition',
                        domain.isActive(pathname)
                          ? 'text-cyan-400'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      )}
                    >
                      <span>{domain.label}</span>
                      <ChevronDown
                        className={cn('w-4 h-4 transition-transform', sectionOpen && 'rotate-180')}
                      />
                    </button>
                    {sectionOpen && (
                      <div className="ml-4 border-l border-slate-700 pl-3 pb-1 space-y-0.5">
                        {domain.links.map((l) => (
                          <React.Fragment key={l.href}>
                            {l.sectionBefore && (
                              <div className="pt-2 pb-0.5">
                                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                                  {l.sectionBefore}
                                </span>
                              </div>
                            )}
                            <Link
                              href={l.href}
                              className={cn(
                                'flex items-center px-3 py-2 rounded-lg text-sm transition',
                                pathname === l.href
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                              )}
                            >
                              {l.label}
                            </Link>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {showAdmin && (
                <>
                  <button
                    onClick={() => toggleMobileSection('admin')}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition',
                      pathname.startsWith('/admin')
                        ? 'text-cyan-400'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    )}
                  >
                    <span>Admin</span>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform',
                        mobileOpenSections.has('admin') && 'rotate-180'
                      )}
                    />
                  </button>
                  {mobileOpenSections.has('admin') && (
                    <div className="ml-4 border-l border-slate-700 pl-3 pb-1 space-y-0.5">
                      {adminLinks.map((l) => (
                        <React.Fragment key={l.href}>
                          {l.sectionBefore && (
                            <div className="pt-2 pb-0.5">
                              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                                {l.sectionBefore}
                              </span>
                            </div>
                          )}
                          <Link
                            href={l.href}
                            className={cn(
                              'flex items-center px-3 py-2 rounded-lg text-sm transition',
                              pathname === l.href
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800'
                            )}
                          >
                            {l.label}
                          </Link>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="pt-2 border-t border-slate-800">
                <div className="px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                  Account — {name}
                </div>
                <Link
                  href={`/it-issues?report=1&from=${encodeURIComponent(pathname)}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  <Wrench className="w-4 h-4" />
                  Report an Issue
                </Link>
                <Link
                  href={helpHref}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  <HelpCircle className="w-4 h-4" />
                  Help &amp; Docs
                </Link>
                <Link
                  href="/account/subscriptions"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  <Mail className="w-4 h-4" />
                  Email Subscriptions
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: signOutUrl })}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-red-400 hover:bg-slate-800 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}

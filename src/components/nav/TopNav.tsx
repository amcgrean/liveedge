'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  LogOut, ChevronDown, Menu, X, Settings,
  Truck, ShoppingCart, FileText, Wrench, PackageCheck, MapPin, Search,
  Boxes, HelpCircle, User,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// ─── Branch switcher ──────────────────────────────────────────────────────────

const BRANCH_OPTIONS = [
  { code: '',     label: 'All Branches' },
  { code: '10FD', label: '10FD · Fort Dodge' },
  { code: '20GR', label: '20GR · Grimes' },
  { code: '25BW', label: '25BW · Birchwood' },
  { code: '40CV', label: '40CV · Coralville' },
] as const;

/** Per-branch color tokens: button bg/text and dot indicator */
const BRANCH_COLORS: Record<string, { btn: string; dot: string; active: string }> = {
  '10FD': { btn: 'bg-amber-900/40  text-amber-300  hover:bg-amber-900/60',  dot: 'bg-amber-400',  active: 'bg-amber-500/20 text-amber-300' },
  '20GR': { btn: 'bg-blue-900/40   text-blue-300   hover:bg-blue-900/60',   dot: 'bg-blue-400',   active: 'bg-blue-500/20  text-blue-300'  },
  '25BW': { btn: 'bg-violet-900/40 text-violet-300 hover:bg-violet-900/60', dot: 'bg-violet-400', active: 'bg-violet-500/20 text-violet-300'},
  '40CV': { btn: 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60', dot: 'bg-emerald-400', active: 'bg-emerald-500/20 text-emerald-300' },
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
    setCurrent(readBranchCookie());
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
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const label = BRANCH_OPTIONS.find((b) => b.code === current)?.label ?? 'All Branches';
  const shortLabel = current || 'All';
  const colors = current ? BRANCH_COLORS[current] : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        disabled={saving}
        title={label}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition',
          colors ? colors.btn : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
        )}
      >
        {colors
          ? <span className={cn('w-2 h-2 rounded-full flex-shrink-0', colors.dot)} />
          : <MapPin className="w-3 h-3" />
        }
        {saving ? '…' : shortLabel}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 min-w-[200px] bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
          {BRANCH_OPTIONS.map((b) => {
            const bc = b.code ? BRANCH_COLORS[b.code] : null;
            const isActive = b.code === current;
            return (
              <button
                key={b.code}
                onClick={() => select(b.code)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition',
                  isActive
                    ? (bc ? bc.active : 'bg-slate-700/50 text-white')
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                {bc
                  ? <span className={cn('w-2 h-2 rounded-full flex-shrink-0', bc.dot)} />
                  : <MapPin className="w-3 h-3 text-slate-500" />
                }
                {b.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ('');
  }, [open]);

  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((p) => !p);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="relative hidden sm:block">
      {open ? (
        <form onSubmit={submit} className="flex items-center">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-48 px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
          <button type="button" onClick={() => setOpen(false)} className="ml-1 p-1.5 text-gray-500 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition"
          title="Search (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden md:inline text-gray-600 text-[10px] font-mono border border-gray-700 rounded px-1">⌘K</span>
        </button>
      )}
    </div>
  );
}

// ─── Nav structure ────────────────────────────────────────────────────────────

interface NavLink {
  href: string;
  label: string;
  requireAnyRole?: string[];
  /** Renders a labeled section divider above this link in the dropdown */
  sectionBefore?: string;
}

interface Domain {
  id: string;
  label: string;
  icon: React.ReactNode;
  links: NavLink[];
  isActive: (p: string) => boolean;
  dropdown: boolean;
  href?: string;
}

function getDomains(tvBranch: string): Domain[] {
  return [
    {
      id: 'yard',
      label: 'Yard',
      icon: <Boxes className="w-4 h-4" />,
      dropdown: true,
      isActive: (p) =>
        ['/warehouse', '/work-orders', '/supervisor'].some(
          (prefix) => p === prefix || p.startsWith(prefix + '/')
        ) || p.startsWith('/tv/') || p.startsWith('/kiosk/'),
      links: [
        { href: '/warehouse',              label: 'Picks Board' },
        { href: '/warehouse/open-picks',   label: 'Open Picks' },
        { href: '/warehouse/picker-stats', label: 'Picker Stats' },
        { href: '/work-orders',            label: 'Work Orders' },
        { href: '/supervisor',             label: 'Supervisor',   requireAnyRole: ['supervisor', 'ops', 'warehouse'] },
        { href: `/tv/${tvBranch}`,         label: 'TV Board',     requireAnyRole: ['supervisor', 'ops', 'warehouse'] },
        { href: '/warehouse/pickers',      label: 'Picker Admin', requireAnyRole: ['supervisor', 'ops'] },
      ],
    },
    {
      id: 'dispatch',
      label: 'Dispatch',
      icon: <Truck className="w-4 h-4" />,
      dropdown: true,
      isActive: (p) =>
        ['/dispatch', '/delivery'].some((prefix) => p === prefix || p.startsWith(prefix + '/')) ||
        p.startsWith('/ops/delivery'),
      links: [
        { href: '/dispatch',               label: 'Dispatch Board' },
        { href: '/dispatch/drivers',       label: 'Driver Roster',   requireAnyRole: ['supervisor', 'ops', 'dispatch'] },
        { href: '/delivery',               label: 'Delivery Tracker' },
        { href: '/delivery/map',           label: 'Fleet Map' },
        { href: '/ops/delivery-reporting', label: 'Delivery Report', requireAnyRole: ['supervisor', 'ops'] },
      ],
    },
    {
      id: 'sales',
      label: 'Sales',
      icon: <ShoppingCart className="w-4 h-4" />,
      dropdown: true,
      isActive: (p) => p.startsWith('/sales') || p.startsWith('/credits'),
      links: [
        { href: '/sales',               label: 'Sales Hub' },
        { href: '/sales/customers',     label: 'Customers' },
        { href: '/sales/transactions',  label: 'Transactions' },
        { href: '/sales/history',       label: 'Purchase History' },
        { href: '/sales/products',      label: 'Products & Stock' },
        { href: '/sales/reports',       label: 'Reports' },
        { href: '/sales/tracker',       label: 'Sales Tracker',    requireAnyRole: ['sales', 'ops', 'supervisor'] },
        { href: '/sales/deliveries',    label: 'Sales Deliveries', requireAnyRole: ['sales', 'ops', 'supervisor'] },
        { href: '/sales/rep-dashboard', label: 'Rep Dashboard',    requireAnyRole: ['sales'] },
        { href: '/credits',             label: 'RMA Credits' },
      ],
    },
    {
      id: 'estimating',
      label: 'Services',
      icon: <FileText className="w-4 h-4" />,
      dropdown: true,
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
        { href: '/estimating',            label: 'Estimating App' },
        { href: '/takeoff',               label: 'PDF Takeoff' },
        { href: '/legacy-bids',           label: 'Bids' },
        { href: '/legacy-bids/completed', label: 'Completed Bids' },
        { href: '/all-bids',              label: 'All Bids' },
        { href: '/bids',                  label: 'Bid Projects' },
        { href: '/ewp',                   label: 'EWP' },
        { href: '/projects',              label: 'Projects' },
        { href: '/designs',               label: 'Design' },
      ],
    },
    {
      id: 'purchasing',
      label: 'Purchasing',
      icon: <PackageCheck className="w-4 h-4" />,
      dropdown: true,
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
        { href: '/purchasing/workspace',      label: 'Buyer Workspace', requireAnyRole: ['purchasing', 'ops', 'supervisor'] },
        { href: '/purchasing/open-pos',       label: 'Open POs',        requireAnyRole: ['purchasing', 'ops', 'supervisor', 'sales'] },
        { href: '/purchasing/suggested-buys', label: 'Suggested Buys',  requireAnyRole: ['purchasing', 'ops', 'supervisor'] },
        { href: '/purchasing/exceptions',     label: 'Exceptions',      requireAnyRole: ['purchasing', 'ops', 'supervisor'] },
        { href: '/purchasing/manage',         label: 'Command Center',  requireAnyRole: ['purchasing', 'ops', 'supervisor'] },
        // Receiving — merged from former top-level Receiving menu
        { href: '/purchasing',        label: 'PO Check-In',  sectionBefore: 'Receiving' },
        { href: '/purchasing/review', label: 'Review Queue', requireAnyRole: ['purchasing', 'ops', 'supervisor'] },
      ],
    },
  ];
}

const ADMIN_LINKS: NavLink[] = [
  { href: '/admin',               label: 'Dashboard' },
  // General
  { href: '/admin/customers',     label: 'Customers',       sectionBefore: 'General' },
  { href: '/admin/products',      label: 'Products / SKUs' },
  { href: '/admin/formulas',      label: 'Formulas' },
  // Services
  { href: '/admin/bid-fields',    label: 'Bid Fields',      sectionBefore: 'Services' },
  // Users
  { href: '/admin/users',         label: 'Users',           sectionBefore: 'Users' },
  { href: '/admin/notifications', label: 'Notifications' },
  // System
  { href: '/admin/audit',         label: 'Audit Log',       sectionBefore: 'System' },
  { href: '/admin/erp',           label: 'ERP Sync' },
  { href: '/admin/analytics',     label: 'Page Analytics' },
];

// ─── Role helpers ─────────────────────────────────────────────────────────────

const WH_ROLES = ['warehouse', 'sales', 'ops', 'supervisor', 'purchasing', 'dispatch'] as const;
type WHRole = typeof WH_ROLES[number];

function hasAnyRole(roles: string[], ...check: WHRole[]): boolean {
  return check.some((r) => roles.includes(r));
}

function canSeeSection(domainId: string, role: string, roles: string[]): boolean {
  if (role === 'admin') return true;
  const isWHUser = (WH_ROLES as readonly string[]).some((r) => roles.includes(r));
  switch (domainId) {
    case 'yard':
      return hasAnyRole(roles, 'warehouse', 'sales', 'ops', 'supervisor', 'dispatch');
    case 'dispatch':
      return hasAnyRole(roles, 'warehouse', 'sales', 'ops', 'supervisor', 'dispatch');
    case 'sales':
      return hasAnyRole(roles, 'sales', 'ops', 'supervisor');
    case 'estimating':
      return (role === 'admin' || role === 'estimator') && !isWHUser;
    case 'purchasing':
      // Covers both purchasing and receiving (merged)
      return role !== 'viewer';
    default:
      return false;
  }
}

function canSeeLink(link: NavLink, role: string, roles: string[]): boolean {
  if (role === 'admin') return true;
  if (!link.requireAnyRole) return true;
  return link.requireAnyRole.some((r) => roles.includes(r));
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userName?: string | null;
  userRole?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TopNav({ userName, userRole }: Props) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobileOpenSections, setMobileOpenSections] = React.useState<Set<string>>(new Set());
  const [tvBranch, setTvBranch] = React.useState('20GR');
  const navRef = React.useRef<HTMLElement>(null);

  const name: string = session?.user?.name ?? userName ?? 'User';
  const role: string = (session?.user as { role?: string } | undefined)?.role ?? userRole ?? 'viewer';
  const roles: string[] = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];

  const signOutUrl = '/login';

  React.useEffect(() => {
    const branch = readBranchCookie();
    if (branch) setTvBranch(branch);
  }, []);

  const DOMAINS = getDomains(tvBranch);
  const visibleDomains = DOMAINS
    .filter((d) => canSeeSection(d.id, role, roles))
    .map((d) => ({
      ...d,
      links: d.links.filter((l) => canSeeLink(l, role, roles)),
    }));

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

  /** Renders a single dropdown link, with an optional labeled section divider above it */
  function renderDropdownLink(l: NavLink) {
    const isCurrentPath =
      pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href + '/'));
    return (
      <React.Fragment key={l.href}>
        {l.sectionBefore && (
          <div className="px-4 pt-2.5 pb-1">
            <div className="border-t border-slate-700/60" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mt-2 block">
              {l.sectionBefore}
            </span>
          </div>
        )}
        <Link
          href={l.href}
          onClick={() => setOpenMenu(null)}
          className={cn(
            'block px-4 py-2.5 text-sm transition whitespace-nowrap',
            isCurrentPath
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
        className="sticky top-0 z-50 bg-slate-950/90 border-b border-white/10 backdrop-blur-sm print:hidden"
      >
        <div className="max-w-screen-2xl mx-auto px-4 flex items-center justify-between h-14">

          {/* Brand */}
          <div className="flex items-center gap-1">
            <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 mr-3">
              {/* Beisser B logo badge */}
              <span className="flex items-center justify-center w-8 h-8 bg-white rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                <img
                  src="/icons/beisser_B_full_color_RGB.png"
                  alt="Beisser"
                  className="w-full h-full object-cover"
                />
              </span>
              {/* App name */}
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-[9px] text-slate-400 font-normal tracking-widest uppercase leading-none">
                  Beisser Lumber
                </span>
                <span className="text-base font-bold leading-none text-white">
                  Live<span className="text-cyan-400">Edge</span>
                </span>
              </div>
            </Link>

            {/* Desktop domain nav — role-filtered */}
            <div className="hidden lg:flex items-center gap-0.5">
              {visibleDomains.map((domain) => {
                const active = domain.isActive(pathname);
                const baseCls = cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition',
                  active
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                );

                if (!domain.dropdown) {
                  return (
                    <Link key={domain.id} href={domain.href!} className={baseCls}>
                      {domain.icon}
                      {domain.label}
                    </Link>
                  );
                }

                return (
                  <div key={domain.id} className="relative">
                    <button onClick={() => toggle(domain.id)} className={baseCls}>
                      {domain.icon}
                      <span>{domain.label}</span>
                      <ChevronDown
                        className={cn(
                          'w-3 h-3 transition-transform',
                          openMenu === domain.id && 'rotate-180'
                        )}
                      />
                    </button>
                    {openMenu === domain.id && (
                      <div className="absolute left-0 mt-1 min-w-[170px] bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                        {domain.links.map((l) => renderDropdownLink(l))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <GlobalSearch />
            <BranchSwitcher />

            {/* Admin dropdown — desktop only */}
            {role === 'admin' && (
              <div className="relative hidden lg:block">
                <button
                  onClick={() => toggle('admin')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition',
                    pathname.startsWith('/admin')
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  )}
                >
                  <Settings className="w-4 h-4" />
                  <span>Admin</span>
                  <ChevronDown
                    className={cn('w-3 h-3 transition-transform', openMenu === 'admin' && 'rotate-180')}
                  />
                </button>
                {openMenu === 'admin' && (
                  <div className="absolute right-0 mt-1 min-w-[190px] bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                    {ADMIN_LINKS.map((l) => renderDropdownLink(l))}
                  </div>
                )}
              </div>
            )}

            {/* User dropdown — desktop */}
            <div className="relative hidden sm:block pl-3 border-l border-slate-700">
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
                <div className="absolute right-0 mt-1 min-w-[210px] bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-2.5 border-b border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Signed in as</p>
                    <p className="text-sm font-semibold text-white truncate mt-0.5">{name}</p>
                  </div>
                  <Link
                    href="/it-issues"
                    onClick={() => setOpenMenu(null)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Wrench className="w-4 h-4 flex-shrink-0" />
                    Report an Issue
                  </Link>
                  <Link
                    href="/help"
                    onClick={() => setOpenMenu(null)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <HelpCircle className="w-4 h-4 flex-shrink-0" />
                    Help &amp; Docs
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

            {/* Mobile hamburger */}
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col print:hidden">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative mt-14 bg-slate-900 border-b border-white/10 shadow-xl overflow-y-auto max-h-[calc(100vh-3.5rem)]">
            <div className="px-4 py-3 space-y-0.5">

              {/* Mobile search */}
              <Link
                href="/search"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <Search className="w-4 h-4" />
                Search
              </Link>
              <div className="border-t border-slate-800 my-1" />

              {/* Domain sections */}
              {visibleDomains.map((domain) => {
                const sectionOpen = mobileOpenSections.has(domain.id);

                if (!domain.dropdown) {
                  return (
                    <Link
                      key={domain.id}
                      href={domain.href!}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition',
                        domain.isActive(pathname)
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      )}
                    >
                      {domain.icon}
                      {domain.label}
                    </Link>
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
                      <span className="flex items-center gap-2">
                        {domain.icon}
                        {domain.label}
                      </span>
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

              {/* Admin section (mobile) */}
              {role === 'admin' && (
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
                    <span className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Admin
                    </span>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform',
                        mobileOpenSections.has('admin') && 'rotate-180'
                      )}
                    />
                  </button>
                  {mobileOpenSections.has('admin') && (
                    <div className="ml-4 border-l border-slate-700 pl-3 pb-1 space-y-0.5">
                      {ADMIN_LINKS.map((l) => (
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

              {/* Account section (mobile) */}
              <div className="pt-2 border-t border-slate-800">
                <div className="px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                  Account — {name}
                </div>
                <Link
                  href="/it-issues"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  <Wrench className="w-4 h-4" />
                  Report an Issue
                </Link>
                <Link
                  href="/help"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  <HelpCircle className="w-4 h-4" />
                  Help &amp; Docs
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

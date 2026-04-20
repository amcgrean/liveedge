'use client';

import React from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TopNav } from '../../src/components/nav/TopNav';
import {
  LayoutDashboard, Users, Building2, Package, Calculator,
  FormInput, Bell, FileText, Database, BarChart2, Menu, X, Briefcase,
} from 'lucide-react';
import { cn } from '../../src/lib/utils';

// ─── Grouped nav sections ────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    title: 'General',
    items: [
      { href: '/admin',               label: 'Dashboard',      icon: LayoutDashboard, exact: true  },
      { href: '/admin/customers',     label: 'Customers',      icon: Building2,       exact: false },
      { href: '/admin/products',      label: 'Products / SKUs',icon: Package,         exact: false },
      { href: '/admin/formulas',      label: 'Formulas',       icon: Calculator,      exact: false },
    ],
  },
  {
    title: 'Services',
    items: [
      { href: '/admin/bid-fields',    label: 'Bid Fields',     icon: FormInput,       exact: false },
    ],
  },
  {
    title: 'Users',
    items: [
      { href: '/admin/users',         label: 'Users',          icon: Users,           exact: false },
      { href: '/admin/notifications', label: 'Notifications',  icon: Bell,            exact: false },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/admin/jobs',          label: 'Job Review',     icon: Briefcase,       exact: false },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/audit',         label: 'Audit Log',      icon: FileText,        exact: false },
      { href: '/admin/erp',           label: 'ERP Sync',       icon: Database,        exact: false },
      { href: '/admin/analytics',     label: 'Page Analytics', icon: BarChart2,       exact: false },
    ],
  },
];

// Flatten for quick lookup
const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

interface Props { session: Session; children: React.ReactNode; }

export default function AdminLayoutClient({ session, children }: Props) {
  const pathname = usePathname();
  const role = (session.user as { role?: string }).role ?? 'estimator';
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // Close mobile drawer on navigation
  React.useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Current page label for mobile header breadcrumb
  const currentItem = ALL_ITEMS.find((i) =>
    i.exact ? pathname === i.href : pathname.startsWith(i.href)
  );

  const sidebarNav = (
    <div className="space-y-5 p-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5 px-2">
            {section.title}
          </p>
          <nav className="space-y-0.5">
            {section.items.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                    active
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen">
      <TopNav userName={session.user?.name} userRole={role} />

      {/* ── Mobile admin bar ── */}
      <div className="lg:hidden flex items-center gap-3 px-4 py-2.5 bg-slate-950/70 border-b border-white/10 sticky top-14 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex items-center gap-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          aria-label="Open admin navigation"
        >
          <Menu className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Admin</span>
        </button>
        {currentItem && (
          <>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-300 font-medium">{currentItem.label}</span>
          </>
        )}
      </div>

      <div className="flex">
        {/* ── Desktop sidebar ── */}
        <aside className="hidden lg:block w-56 min-h-[calc(100vh-3.5rem)] bg-slate-950/60 border-r border-white/10 sticky top-14 self-start shrink-0">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-2">
              Admin Panel
            </p>
          </div>
          {sidebarNav}
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 p-4 sm:p-6">{children}</main>
      </div>

      {/* ── Mobile drawer ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex print:hidden">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-64 max-w-[85vw] bg-slate-900 border-r border-white/10 h-full overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-bold text-white">Admin Panel</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {sidebarNav}
          </div>
        </div>
      )}
    </div>
  );
}

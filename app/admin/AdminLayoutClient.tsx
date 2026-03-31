'use client';

import React from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TopNav } from '../../src/components/nav/TopNav';
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  Calculator,
  FormInput,
  Bell,
  FileText,
} from 'lucide-react';
import { cn } from '../../src/lib/utils';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/customers', label: 'Customers', icon: Building2, exact: false },
  { href: '/admin/products', label: 'Products', icon: Package, exact: false },
  { href: '/admin/formulas', label: 'Formulas', icon: Calculator, exact: false },
  { href: '/admin/users', label: 'Users', icon: Users, exact: false },
  { href: '/admin/bid-fields', label: 'Bid Fields', icon: FormInput, exact: false },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell, exact: false },
  { href: '/admin/audit', label: 'Audit Log', icon: FileText, exact: false },
];

interface Props { session: Session; children: React.ReactNode; }

export default function AdminLayoutClient({ session, children }: Props) {
  const pathname = usePathname();
  const role = (session.user as { role?: string }).role ?? 'estimator';

  return (
    <div className="min-h-screen">
      <TopNav userName={session.user?.name} userRole={role} />
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 min-h-[calc(100vh-56px)] bg-slate-950/60 border-r border-white/10 sticky top-14 shrink-0">
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 px-2">
              Admin Panel
            </p>
            <nav className="space-y-0.5">
              {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
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
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

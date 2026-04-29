'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart2, Building2, Users, List, Package, Loader2 } from 'lucide-react';

const TABS = [
  { href: '/scorecard/overview', label: 'Company Overview', icon: BarChart2 },
  { href: '/scorecard/branch', label: 'By Branch', icon: Building2 },
  { href: '/scorecard/rep', label: 'By Sales Rep', icon: Users },
  { href: '/scorecard/product', label: 'Product Groups', icon: Package },
  { href: '/scorecard', label: 'Customers', icon: List, exact: true },
];

export default function ScorecardTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  function isActive(tab: typeof TABS[number]): boolean {
    if (pendingHref) return tab.href === pendingHref;
    if (tab.exact) return pathname === tab.href;
    return pathname.startsWith(tab.href);
  }

  function handleClick(href: string) {
    if (href === pathname) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
      setPendingHref(null);
    });
  }

  return (
    <div className="flex gap-1 border-b border-slate-700 mb-5 print:hidden">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab);
        const loading = isPending && pendingHref === tab.href;
        return (
          <button
            key={tab.href}
            onClick={() => handleClick(tab.href)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              active
                ? 'border-cyan-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Icon className="w-3.5 h-3.5" />
            }
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

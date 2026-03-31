'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Settings,
  LogOut,
  ChevronDown,
  Hammer,
  Ruler,
  Layers,
  Building2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  userName?: string | null;
  userRole?: string;
}

export function TopNav({ userName, userRole }: Props) {
  const pathname = usePathname();
  const [adminOpen, setAdminOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navLink = (href: string, label: string, icon?: React.ReactNode) => (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
        pathname === href
          ? 'bg-cyan-500/20 text-cyan-400'
          : 'text-slate-300 hover:text-white hover:bg-slate-800'
      )}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <nav className="sticky top-0 z-50 bg-slate-950/90 border-b border-white/10 backdrop-blur-sm">
      <div className="max-w-8xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-white font-bold text-lg">
            <Hammer className="w-5 h-5 text-cyan-400" />
            <span className="hidden sm:inline">Beisser</span>
            <span className="text-cyan-400">Takeoff</span>
          </Link>

          {/* Main nav */}
          <div className="flex items-center gap-1">
            {navLink('/dashboard', 'Dashboard', <LayoutDashboard className="w-4 h-4" />)}
            {navLink('/legacy-bids', 'Bids', <FolderOpen className="w-4 h-4" />)}
            {navLink('/designs', 'Designs', <Ruler className="w-4 h-4" />)}
            {navLink('/ewp', 'EWP', <Layers className="w-4 h-4" />)}
            {navLink('/projects', 'Projects', <Building2 className="w-4 h-4" />)}
            {navLink('/', 'Estimating', <FileText className="w-4 h-4" />)}
            {navLink('/takeoff', 'PDF Takeoff', <Hammer className="w-4 h-4" />)}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Admin dropdown */}
          {userRole === 'admin' && (
            <div className="relative" ref={ref}>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
                  pathname.startsWith('/admin')
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                )}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Admin</span>
                <ChevronDown className={cn('w-3 h-3 transition', adminOpen && 'rotate-180')} />
              </button>

              {adminOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden">
                  {[
                    { href: '/admin', label: 'Dashboard' },
                    { href: '/admin/customers', label: 'Customers' },
                    { href: '/admin/products', label: 'Products / SKUs' },
                    { href: '/admin/formulas', label: 'Formulas' },
                    { href: '/admin/users', label: 'Users' },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAdminOpen(false)}
                      className={cn(
                        'block px-4 py-2.5 text-sm transition',
                        pathname === item.href
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* User info + logout */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-700">
            <span className="text-sm text-slate-400 hidden sm:inline">
              {userName ?? 'User'}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

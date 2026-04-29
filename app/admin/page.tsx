import { auth } from '../../auth';
import Link from 'next/link';
import {
  Building2, Package, Calculator, Users, Bell,
  FileText, Database, BarChart2, FormInput, LayoutDashboard, UserCog,
} from 'lucide-react';

export const metadata = { title: 'Admin Dashboard | LiveEdge' };

const SECTIONS = [
  {
    title: 'General',
    description: 'Core data — customers, products, and calculation rules',
    cards: [
      { href: '/admin/customers',  label: 'Customers',       description: 'Manage customer accounts and contacts', icon: Building2,  color: 'text-blue-400   bg-blue-400/10   border-blue-400/20'   },
      { href: '/admin/products',   label: 'Products / SKUs', description: 'Manage the product SKU catalog',        icon: Package,    color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
      { href: '/admin/formulas',   label: 'Formulas',        description: 'Edit multipliers and calc rules',       icon: Calculator, color: 'text-green-400  bg-green-400/10  border-green-400/20'  },
    ],
  },
  {
    title: 'Services',
    description: 'Estimating and bid configuration',
    cards: [
      { href: '/admin/bid-fields', label: 'Bid Fields', description: 'Configure custom fields for bids', icon: FormInput, color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
    ],
  },
  {
    title: 'Users',
    description: 'Team members and notification rules',
    cards: [
      { href: '/admin/users',         label: 'Users',         description: 'Add, edit, and manage access',             icon: Users,   color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
      { href: '/warehouse/pickers',   label: 'Picker Admin',  description: 'Manage warehouse pickers (legacy roster)', icon: UserCog, color: 'text-pink-400   bg-pink-400/10   border-pink-400/20'   },
      { href: '/admin/notifications', label: 'Notifications', description: 'Set up event-triggered notification rules', icon: Bell,    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
    ],
  },
  {
    title: 'System',
    description: 'Audit trail, ERP connection, and usage analytics',
    cards: [
      { href: '/admin/audit',     label: 'Audit Log',      description: 'Review all data changes with attribution', icon: FileText,  color: 'text-red-400   bg-red-400/10   border-red-400/20'   },
      { href: '/admin/erp',       label: 'ERP Sync',       description: 'ERP connection status and data sync',      icon: Database,  color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
      { href: '/admin/analytics', label: 'Page Analytics', description: 'Page visit stats by user and route',       icon: BarChart2, color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
    ],
  },
];

export default async function AdminDashboard() {
  const session = await auth();
  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <LayoutDashboard className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Welcome, {session?.user?.name}. Manage users, data, and system configuration.
        </p>
      </div>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              {section.title}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">{section.description}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.cards.map(({ href, label, description, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                className="group bg-slate-900/60 border border-white/10 rounded-xl p-5 hover:bg-slate-900 hover:border-white/20 transition"
              >
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center mb-3 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="font-semibold text-white text-sm mb-1 group-hover:text-cyan-400 transition">
                  {label}
                </p>
                <p className="text-xs text-slate-500">{description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

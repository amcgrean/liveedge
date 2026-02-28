import { auth } from '../../auth';
import Link from 'next/link';
import { Building2, Package, Calculator, Users, FolderOpen } from 'lucide-react';

export const metadata = { title: 'Admin Dashboard | Beisser Takeoff' };

const CARDS = [
  { href: '/bids', label: 'All Bids', description: 'View and manage all estimates', icon: FolderOpen, color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
  { href: '/admin/customers', label: 'Customers', description: 'Manage customer accounts', icon: Building2, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  { href: '/admin/products', label: 'Products / SKUs', description: 'Manage product catalog', icon: Package, color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  { href: '/admin/formulas', label: 'Formulas & Multipliers', description: 'Edit calculation rules', icon: Calculator, color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  { href: '/admin/users', label: 'Users', description: 'Manage team members', icon: Users, color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
];

export default async function AdminDashboard() {
  const session = await auth();
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Welcome, {session?.user?.name}. Manage your Beisser Takeoff system.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(({ href, label, description, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="group bg-slate-900/60 border border-white/10 rounded-xl p-6 hover:bg-slate-900 hover:border-white/20 transition"
          >
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-4 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white mb-1 group-hover:text-cyan-400 transition">
              {label}
            </h3>
            <p className="text-sm text-slate-400">{description}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <p className="text-amber-400 text-sm font-medium mb-1">Getting Started</p>
        <p className="text-slate-400 text-sm">
          1. Run <code className="text-cyan-400 bg-slate-800 px-1 rounded">npm run db:migrate</code> to create tables, then{' '}
          <code className="text-cyan-400 bg-slate-800 px-1 rounded">npm run db:seed</code> to populate initial data.
          <br />2. Add your Neon <code className="text-cyan-400 bg-slate-800 px-1 rounded">DATABASE_URL</code> to Vercel environment variables.
          <br />3. Change the default admin password under <Link href="/admin/users" className="text-cyan-400 hover:underline">Users</Link>.
        </p>
      </div>
    </div>
  );
}

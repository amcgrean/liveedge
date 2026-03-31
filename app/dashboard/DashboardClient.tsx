'use client';

import React, { useEffect, useState } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import {
  FileText,
  PenTool,
  CheckCircle,
  Clock,
  Activity,
  ArrowRight,
} from 'lucide-react';

interface DashboardData {
  openBids: number;
  openDesigns: number;
  ytdCompleted: number;
  avgCompletionDays: number;
  recentActivity: {
    id: number;
    bidId: number;
    action: string;
    timestamp: string;
  }[];
}

interface Props {
  session: Session;
}

export default function DashboardClient({ session }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : data ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KPICard
                icon={<FileText className="w-5 h-5" />}
                label="Open Bids"
                value={data.openBids}
                href="/legacy-bids"
                color="cyan"
              />
              <KPICard
                icon={<PenTool className="w-5 h-5" />}
                label="Open Designs"
                value={data.openDesigns}
                color="purple"
              />
              <KPICard
                icon={<CheckCircle className="w-5 h-5" />}
                label="YTD Completed"
                value={data.ytdCompleted}
                href="/legacy-bids/completed"
                color="green"
              />
              <KPICard
                icon={<Clock className="w-5 h-5" />}
                label="Avg Completion"
                value={`${data.avgCompletionDays}d`}
                color="amber"
              />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <Link
                href="/legacy-bids/add"
                className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-cyan-500/50 transition-colors"
              >
                <FileText className="w-5 h-5 text-cyan-400" />
                <span>New Bid</span>
                <ArrowRight className="w-4 h-4 ml-auto text-gray-500" />
              </Link>
              <Link
                href="/legacy-bids"
                className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-cyan-500/50 transition-colors"
              >
                <FileText className="w-5 h-5 text-cyan-400" />
                <span>Open Bids</span>
                <ArrowRight className="w-4 h-4 ml-auto text-gray-500" />
              </Link>
              <Link
                href="/"
                className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-cyan-500/50 transition-colors"
              >
                <PenTool className="w-5 h-5 text-cyan-400" />
                <span>Estimating</span>
                <ArrowRight className="w-4 h-4 ml-auto text-gray-500" />
              </Link>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                Recent Activity
              </h2>
              {data.recentActivity.length === 0 ? (
                <p className="text-gray-500 text-sm">No recent activity</p>
              ) : (
                <div className="space-y-2">
                  {data.recentActivity.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between text-sm py-2 border-b border-gray-800 last:border-0"
                    >
                      <span>
                        <span className="text-gray-400">Bid #{a.bidId}</span>{' '}
                        <span className="text-gray-300">{a.action}</span>
                      </span>
                      <span className="text-gray-500 text-xs">
                        {new Date(a.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-red-400">Failed to load dashboard data</div>
        )}
      </main>
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  href,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  href?: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    cyan: 'border-cyan-500/30 text-cyan-400',
    purple: 'border-purple-500/30 text-purple-400',
    green: 'border-green-500/30 text-green-400',
    amber: 'border-amber-500/30 text-amber-400',
  };
  const cls = colorMap[color] ?? colorMap.cyan;

  const content = (
    <div
      className={`bg-gray-900 border rounded-lg p-4 ${cls} ${href ? 'hover:bg-gray-800 transition-colors cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

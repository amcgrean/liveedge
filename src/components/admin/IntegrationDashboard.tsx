import React, { useState, useEffect } from 'react';
import { IntegrationJob, OperationalStats, integrationService } from '../../services/integrationService';
import { Network, ArrowRightLeft, Clock, AlertOctagon, TrendingUp, Filter, RefreshCw } from 'lucide-react';

export function IntegrationDashboard() {
    const [jobs, setJobs] = useState<IntegrationJob[]>([]);
    const [stats, setStats] = useState<OperationalStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            const [fetchedJobs, fetchedStats] = await Promise.all([
                integrationService.getIntegrationJobs(),
                integrationService.getOperationalStats()
            ]);
            setJobs(fetchedJobs);
            setStats(fetchedStats);
            setLoading(false);
        };
        loadData();
    }, []);

    const handleSync = async (jobId: string) => {
        setSyncingId(jobId);
        try {
            const updatedJob = await integrationService.triggerManualSync(jobId);
            setJobs(prev => prev.map(j => j.id === jobId ? updatedJob : j));
        } catch (e) {
            console.error(e);
        } finally {
            setSyncingId(null);
        }
    };

    const getStatusStyles = (status: IntegrationJob['status']) => {
        switch (status) {
            case 'synced': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'complete': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'in-progress': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'pending': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'failed': return 'bg-rose-100 text-rose-800 border-rose-200';
            default: return 'bg-slate-100 text-slate-800 border-slate-200';
        }
    };

    if (loading) {
        return <div className="p-12 text-center text-slate-500">Loading integrations and workflows...</div>;
    }

    return (
        <div className="space-y-6">
            <section className="card p-6 flex items-center justify-between border border-slate-200 drop-shadow-sm">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-teal-100 text-teal-700">
                            <Network className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">Estimating App Integrations</h2>
                    </div>
                    <p className="text-sm text-slate-600 leading-6 max-w-2xl">
                        Monitor incoming bid requests from the estimating application, view orchestration state, and track overall pipeline health.
                    </p>
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 hidden md:flex items-center gap-6">
                    <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Conversion</p>
                        <p className="text-xl font-black text-slate-800">{stats?.conversionRatePercent}%</p>
                    </div>
                    <div className="text-center border-l pl-6 border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><AlertOctagon className="w-3 h-3" /> Error Rate</p>
                        <p className="text-xl font-black text-slate-800">{stats?.errorRatePercent}%</p>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-5 bg-gradient-to-br from-white to-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <h4 className="text-sm font-semibold text-slate-700">Avg Intake Latency</h4>
                    </div>
                    <p className="text-3xl font-black text-slate-800">{stats?.averageLatencyMs} <span className="text-sm font-semibold text-slate-500">ms</span></p>
                </div>
                <div className="card p-5 bg-gradient-to-br from-white to-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                        <ArrowRightLeft className="w-4 h-4 text-emerald-500" />
                        <h4 className="text-sm font-semibold text-slate-700">Active Sync Workflows</h4>
                    </div>
                    <p className="text-3xl font-black text-slate-800">{jobs.filter(j => j.status === 'in-progress' || j.status === 'pending').length}</p>
                </div>
                <div className="card p-5 bg-gradient-to-br from-white to-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertOctagon className="w-4 h-4 text-rose-500" />
                        <h4 className="text-sm font-semibold text-slate-700">Manual Override Rate</h4>
                    </div>
                    <p className="text-3xl font-black text-slate-800">{stats?.manualOverridePercent}%</p>
                </div>
            </section>

            <section className="card overflow-hidden">
                <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">Request Intake Queue</h3>
                    <div className="flex items-center gap-2 text-sm">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <select className="bg-transparent border-none text-slate-600 font-medium focus:ring-0 cursor-pointer">
                            <option>All Statuses</option>
                            <option>Pending</option>
                            <option>In Progress</option>
                            <option>Synced</option>
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white text-slate-500 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Reference ID</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Branch</th>
                                <th className="px-6 py-4">Received</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {jobs.map(job => (
                                <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-slate-700">{job.reference}</td>
                                    <td className="px-6 py-4 font-medium text-slate-900">{job.customer}</td>
                                    <td className="px-6 py-4 text-slate-600">{job.branch}</td>
                                    <td className="px-6 py-4 text-slate-500">
                                        {new Date(job.receivedAt).toLocaleDateString()} {new Date(job.receivedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusStyles(job.status)}`}>
                                            {job.status.charAt(0).toUpperCase() + job.status.slice(1).replace('-', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {job.status === 'complete' || job.status === 'failed' ? (
                                            <button 
                                                onClick={() => handleSync(job.id)}
                                                disabled={syncingId === job.id}
                                                className="inline-flex items-center justify-center p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-teal-600 hover:border-teal-200 hover:bg-teal-50 transition-all disabled:opacity-50"
                                                title="Trigger Sync"
                                            >
                                                <RefreshCw className={`w-4 h-4 ${syncingId === job.id ? 'animate-spin' : ''}`} />
                                            </button>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

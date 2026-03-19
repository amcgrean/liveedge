import React, { useState } from 'react';
import { RegistryDashboard } from './RegistryDashboard';
import { MetricsDashboard } from './MetricsDashboard';
import { IntegrationDashboard } from './IntegrationDashboard';
import { Users, LayoutDashboard, Database, Network } from 'lucide-react';

export function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<'registry' | 'metrics' | 'integrations'>('registry');

    // Role Mock
    const [role, setRole] = useState<'admin' | 'estimator'>('admin');
    const isAdmin = role === 'admin';

    return (
        <div className="space-y-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200">
                <div className="flex gap-6 relative">
                    <button 
                        onClick={() => setActiveTab('registry')}
                        className={`flex items-center gap-2 font-semibold text-sm pb-2 border-b-2 transition-colors ${activeTab === 'registry' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <LayoutDashboard className="w-4 h-4" /> Registry
                    </button>
                    <button 
                        onClick={() => setActiveTab('metrics')}
                        className={`flex items-center gap-2 font-semibold text-sm pb-2 border-b-2 transition-colors ${activeTab === 'metrics' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <Database className="w-4 h-4" /> Metrics & Training
                    </button>
                    <button 
                        onClick={() => setActiveTab('integrations')}
                        className={`flex items-center gap-2 font-semibold text-sm pb-2 border-b-2 transition-colors ${activeTab === 'integrations' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <Network className="w-4 h-4" /> Integrations
                    </button>
                </div>

                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                    <Users className="w-4 h-4 text-slate-500 ml-2" />
                    <div className="flex gap-1">
                        <button 
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${role === 'admin' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            onClick={() => setRole('admin')}
                        >
                            Admin
                        </button>
                        <button 
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${role === 'estimator' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            onClick={() => setRole('estimator')}
                        >
                            Estimator
                        </button>
                    </div>
                </div>
            </header>

            <main>
                {activeTab === 'registry' && <RegistryDashboard isAdmin={isAdmin} />}
                {activeTab === 'metrics' && <MetricsDashboard isAdmin={isAdmin} />}
                {activeTab === 'integrations' && <IntegrationDashboard isAdmin={isAdmin} />}
            </main>
        </div>
    );
}

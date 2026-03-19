import React, { useState, useEffect } from 'react';
import { adminBuildPhases } from '../../data/adminBlueprint';
import { AdminFieldDefinition, FormulaDefinition } from '../../types/admin';
import { adminService } from '../../services/adminService';
import { FieldEditorModal } from './FieldEditorModal';
import { FormulaEditorModal } from './FormulaEditorModal';
import { MetricsDashboard } from './MetricsDashboard';
import { IntegrationDashboard } from './IntegrationDashboard';
import { CheckCircle2, Clock3, Sigma, TableProperties, Edit2, Plus, Users, LayoutDashboard, Database, Network } from 'lucide-react';

const statusStyles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    draft: 'bg-amber-100 text-amber-700',
    'needs-review': 'bg-rose-100 text-rose-700',
    ready: 'bg-emerald-100 text-emerald-700',
    planned: 'bg-blue-100 text-blue-700',
    blocked: 'bg-rose-100 text-rose-700',
};

export function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<'registry' | 'metrics' | 'integrations'>('registry');

    // Registry State
    const [fields, setFields] = useState<AdminFieldDefinition[]>([]);
    const [formulas, setFormulas] = useState<FormulaDefinition[]>([]);
    const [loading, setLoading] = useState(true);

    // Role Mock
    const [role, setRole] = useState<'admin' | 'estimator'>('admin');
    const isAdmin = role === 'admin';

    // Modal State
    const [editingField, setEditingField] = useState<AdminFieldDefinition | null>(null);
    const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);

    const [editingFormula, setEditingFormula] = useState<FormulaDefinition | null>(null);
    const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            const [fetchedFields, fetchedFormulas] = await Promise.all([
                adminService.getFields(),
                adminService.getFormulas()
            ]);
            setFields(fetchedFields);
            setFormulas(fetchedFormulas);
            setLoading(false);
        };
        loadData();
    }, []);

    const handleSaveField = async (updatedField: AdminFieldDefinition) => {
        const saved = await adminService.updateField(updatedField);
        setFields(prev => {
            const index = prev.findIndex(f => f.id === saved.id);
            if (index >= 0) {
                const newArr = [...prev];
                newArr[index] = saved;
                return newArr;
            }
            return [...prev, saved];
        });
    };

    const handleSaveFormula = async (updatedFormula: FormulaDefinition) => {
        const saved = await adminService.updateFormula(updatedFormula);
        setFormulas(prev => {
            const index = prev.findIndex(f => f.id === saved.id);
            if (index >= 0) {
                const newArr = [...prev];
                newArr[index] = saved;
                return newArr;
            }
            return [...prev, saved];
        });
    };

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

            {loading ? (
                <div className="p-12 text-center text-slate-500">Loading admin configuration...</div>
            ) : (
                <main>
                    {activeTab === 'registry' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <section className="card p-6 flex flex-col sm:flex-row justify-between items-start gap-4 border border-slate-200 drop-shadow-sm">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                                            <TableProperties className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-xl font-bold text-slate-900">Fields & Formulas Registry</h2>
                                    </div>
                                    <p className="text-sm text-slate-600 leading-6 max-w-2xl">
                                        Manage canonical schema keys and robust calculation formulas for the takeoff engine.
                                    </p>
                                </div>
                            </section>

                            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="card p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <TableProperties className="w-4 h-4 text-blue-600" />
                                            <h3 className="font-bold text-slate-800">Field Catalog</h3>
                                        </div>
                                        {isAdmin && (
                                            <button 
                                                onClick={() => { setEditingField(null); setIsFieldModalOpen(true); }}
                                                className="text-xs flex items-center gap-1 bg-blue-50 text-blue-700 font-semibold px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                                            >
                                                <Plus className="w-3 h-3" /> New Field
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        {fields.map((field) => (
                                            <div key={field.id} className="group rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-200 transition-colors relative">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                                                            {field.label}
                                                        </p>
                                                        <p className="text-xs text-slate-500 font-mono">{field.path}</p>
                                                    </div>
                                                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                                                        {field.dataType}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-600 mt-2 pr-8">{field.description}</p>
                                                <div className="flex gap-2 mt-2 text-[11px]">
                                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{field.section}</span>
                                                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                                        Metrics: {field.metricsPriority}
                                                    </span>
                                                    {field.required && (
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Required</span>
                                                    )}
                                                </div>
                                                {isAdmin && (
                                                    <button 
                                                        onClick={() => { setEditingField(field); setIsFieldModalOpen(true); }}
                                                        className="absolute bottom-3 right-3 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                                        title="Edit Field"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="card p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Sigma className="w-4 h-4 text-blue-600" />
                                            <h3 className="font-bold text-slate-800">Formula Registry</h3>
                                        </div>
                                        {isAdmin && (
                                            <button 
                                                onClick={() => { setEditingFormula(null); setIsFormulaModalOpen(true); }}
                                                className="text-xs flex items-center gap-1 bg-blue-50 text-blue-700 font-semibold px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                                            >
                                                <Plus className="w-3 h-3" /> New Formula
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        {formulas.map((formula) => (
                                            <div key={formula.id} className="group rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-200 transition-colors relative">
                                                <div className="flex items-center justify-between gap-3 mb-1">
                                                    <p className="font-semibold text-slate-800 text-sm">{formula.name}</p>
                                                    <span className={`text-xs px-2 py-1 rounded-full ${statusStyles[formula.status] || 'bg-slate-100 text-slate-700'}`}>
                                                        {formula.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mb-2">Output: <span className="font-mono">{formula.output}</span></p>
                                                <p className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 text-slate-700 overflow-x-auto">
                                                    {formula.expression}
                                                </p>
                                                {formula.notes && <p className="text-xs text-slate-600 mt-2 pr-8">{formula.notes}</p>}
                                                {isAdmin && (
                                                    <button 
                                                        onClick={() => { setEditingFormula(formula); setIsFormulaModalOpen(true); }}
                                                        className="absolute bottom-3 right-3 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                                        title="Edit Formula"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            <section className="card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Clock3 className="w-4 h-4 text-blue-600" />
                                    <h3 className="font-bold text-slate-800">Build Gameplan History</h3>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {adminBuildPhases.map((phase) => (
                                        <div key={phase.name} className="rounded-xl border border-slate-200 p-4 bg-white opacity-60">
                                            <p className="font-semibold text-slate-800 text-sm mb-2">{phase.name}</p>
                                            <ul className="space-y-1.5">
                                                {phase.outcomes.map((outcome) => (
                                                    <li key={outcome} className="text-xs text-slate-600 flex items-start gap-2">
                                                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
                                                        <span>{outcome}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'metrics' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <MetricsDashboard />
                        </div>
                    )}

                    {activeTab === 'integrations' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <IntegrationDashboard />
                        </div>
                    )}
                </main>
            )}

            <FieldEditorModal 
                field={editingField} 
                open={isFieldModalOpen} 
                onClose={() => setIsFieldModalOpen(false)} 
                onSave={handleSaveField} 
            />

            <FormulaEditorModal 
                formula={editingFormula} 
                open={isFormulaModalOpen} 
                onClose={() => setIsFormulaModalOpen(false)} 
                onSave={handleSaveFormula} 
            />
        </div>
    );
}

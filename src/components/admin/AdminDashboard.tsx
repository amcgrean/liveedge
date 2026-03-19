import React from 'react';
import {
    adminBuildPhases,
    adminFieldCatalog,
    estimatingWorkflowStages,
    formulaDefinitions,
    metricEventDefinitions,
} from '../../data/adminBlueprint';
import { CheckCircle2, Clock3, FlaskConical, GitMerge, Sigma, TableProperties } from 'lucide-react';

const statusStyles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    draft: 'bg-amber-100 text-amber-700',
    'needs-review': 'bg-rose-100 text-rose-700',
    ready: 'bg-emerald-100 text-emerald-700',
    planned: 'bg-blue-100 text-blue-700',
    blocked: 'bg-rose-100 text-rose-700',
};

export function AdminDashboard() {
    return (
        <div className="space-y-6">
            <section className="card p-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                        <TableProperties className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">Admin Portal Starter Dashboard</h2>
                </div>
                <p className="text-sm text-slate-600 leading-6">
                    This is the first wiring pass for a full field and formula management experience. It scopes core entities,
                    metrics requirements for model training, and a cross-repo workflow path from bid intake to takeoff output.
                </p>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <TableProperties className="w-4 h-4 text-blue-600" />
                        <h3 className="font-bold text-slate-800">Field Catalog (Initial)</h3>
                    </div>
                    <div className="space-y-3">
                        {adminFieldCatalog.map((field) => (
                            <div key={field.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <p className="font-semibold text-slate-800 text-sm">{field.label}</p>
                                        <p className="text-xs text-slate-500 font-mono">{field.path}</p>
                                    </div>
                                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                                        {field.dataType}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-2">{field.description}</p>
                                <div className="flex gap-2 mt-2 text-[11px]">
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{field.section}</span>
                                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                        Metrics: {field.metricsPriority}
                                    </span>
                                    {field.required && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Required</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Sigma className="w-4 h-4 text-blue-600" />
                        <h3 className="font-bold text-slate-800">Formula Registry (Initial)</h3>
                    </div>
                    <div className="space-y-3">
                        {formulaDefinitions.map((formula) => (
                            <div key={formula.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-3 mb-1">
                                    <p className="font-semibold text-slate-800 text-sm">{formula.name}</p>
                                    <span className={`text-xs px-2 py-1 rounded-full ${statusStyles[formula.status]}`}>
                                        {formula.status}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mb-2">Output: {formula.output}</p>
                                <p className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 text-slate-700">
                                    {formula.expression}
                                </p>
                                <p className="text-xs text-slate-600 mt-2">{formula.notes}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <FlaskConical className="w-4 h-4 text-blue-600" />
                        <h3 className="font-bold text-slate-800">Bid Input Metrics Contract</h3>
                    </div>
                    <div className="space-y-3">
                        {metricEventDefinitions.map((eventDef) => (
                            <div key={eventDef.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <p className="font-semibold text-slate-800 text-sm">{eventDef.eventName}</p>
                                <p className="text-xs text-slate-600 mt-1"><span className="font-semibold">Trigger:</span> {eventDef.trigger}</p>
                                <p className="text-xs text-slate-600 mt-1"><span className="font-semibold">Purpose:</span> {eventDef.purpose}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {eventDef.payload.map((field) => (
                                        <span key={field} className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-mono">
                                            {field}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <GitMerge className="w-4 h-4 text-blue-600" />
                        <h3 className="font-bold text-slate-800">Estimating App Integration Path</h3>
                    </div>
                    <div className="space-y-3">
                        {estimatingWorkflowStages.map((stage) => (
                            <div key={stage.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="font-semibold text-slate-800 text-sm">{stage.title}</p>
                                    <span className={`text-xs px-2 py-1 rounded-full ${statusStyles[stage.integrationStatus]}`}>
                                        {stage.integrationStatus}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{stage.source} → {stage.destination}</p>
                                <p className="text-xs text-slate-600 mt-2">{stage.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Clock3 className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-800">Build Gameplan</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {adminBuildPhases.map((phase) => (
                        <div key={phase.name} className="rounded-xl border border-slate-200 p-4 bg-white">
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
    );
}

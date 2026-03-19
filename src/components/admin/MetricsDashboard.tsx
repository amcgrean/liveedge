import React, { useState, useEffect } from 'react';
import { TelemetryEvent, DataQualityAlert, metricsService } from '../../services/metricsService';
import { Activity, AlertTriangle, Download, Database, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface Props {
    isAdmin: boolean;
}

export function MetricsDashboard({ isAdmin }: Props) {
    const [events, setEvents] = useState<TelemetryEvent[]>([]);
    const [alerts, setAlerts] = useState<DataQualityAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            const [fetchedEvents, fetchedAlerts] = await Promise.all([
                metricsService.getRecentEvents(),
                metricsService.getDataQualityAlerts()
            ]);
            setEvents(fetchedEvents);
            setAlerts(fetchedAlerts);
            setLoading(false);
        };
        loadData();
    }, []);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const blob = await metricsService.generateTrainingExport();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `training-export-${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } finally {
            setIsExporting(false);
        }
    };

    if (loading) {
        return <div className="p-12 text-center text-slate-500">Loading metrics and quality monitors...</div>;
    }

    return (
        <div className="space-y-6">
            <section className="card p-6 flex flex-col sm:flex-row justify-between drop-shadow-sm border border-slate-200 gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
                            <Database className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">Metrics & Model Readiness</h2>
                    </div>
                    <p className="text-sm text-slate-600 leading-6 max-w-2xl">
                        Monitor live telemetry events, review data quality anomalies, and export verified datasets for ML model training.
                    </p>
                </div>
                <div className="flex items-center">
                    <button
                        onClick={handleExport}
                        disabled={!isAdmin || isExporting}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isAdmin ? "Export" : "Requires Admin Role"}
                    >
                        <Download className="w-4 h-4" />
                        {isExporting ? 'Generating...' : 'Export Training Data'}
                    </button>
                </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-5">
                    <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                        <Activity className="w-4 h-4 text-emerald-600" />
                        <h3 className="font-bold text-slate-800">Event Firehose (Real-time)</h3>
                    </div>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {events.length === 0 ? (
                            <p className="text-sm text-slate-500 italic">No events captured yet.</p>
                        ) : (
                            events.map(event => (
                                <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-emerald-200 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                            {event.type}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(event.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <pre className="text-[10px] text-slate-600 font-mono bg-slate-100 p-2 rounded overflow-x-auto border border-slate-200">
                                        {JSON.stringify(event.payload, null, 2)}
                                    </pre>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="card p-5">
                    <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                        <ShieldAlert className="w-4 h-4 text-rose-600" />
                        <h3 className="font-bold text-slate-800">Data Quality Monitors</h3>
                    </div>
                    <div className="space-y-3">
                        {alerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-8 text-slate-400">
                                <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-400" />
                                <p className="text-sm">All data streams look healthy.</p>
                            </div>
                        ) : (
                            alerts.map(alert => (
                                <div key={alert.id} className={`rounded-xl border p-4 flex gap-3 ${alert.severity === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                    <AlertTriangle className={`w-5 h-5 shrink-0 ${alert.severity === 'error' ? 'text-rose-600' : 'text-amber-600'}`} />
                                    <div>
                                        <p className="text-sm font-semibold mb-1">Anomaly Target: <span className="font-mono bg-white/50 px-1 rounded">{alert.entityId}</span></p>
                                        <p className="text-xs leading-relaxed opacity-90">{alert.message}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}

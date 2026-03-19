export interface TelemetryEvent {
    id: string;
    type: 'bid_input_updated' | 'formula_output_computed' | 'estimate_submitted';
    timestamp: string;
    payload: Record<string, any>;
}

export interface DataQualityAlert {
    id: string;
    severity: 'warning' | 'error';
    message: string;
    entityId: string;
}

const mockEvents: TelemetryEvent[] = [
    {
        id: 'evt-100',
        type: 'bid_input_updated',
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        payload: { field: 'materials.wallSize', prev: '2x4', new: '2x6', estimator_id: 'est-12' }
    },
    {
        id: 'evt-101',
        type: 'formula_output_computed',
        timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
        payload: { formula_id: 'stud-count-basement', output_qty: 145, duration_ms: 12 }
    },
    {
        id: 'evt-102',
        type: 'estimate_submitted',
        timestamp: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
        payload: { estimate_id: 'est-00234', customer: 'Beisser Lumber', status: 'approved' }
    }
];

const mockAlerts: DataQualityAlert[] = [
    {
        id: 'alert-1',
        severity: 'warning',
        message: 'High null rate (15%) detected on Siding Splicers input over the last 7 days.',
        entityId: 'siding.splicers'
    },
    {
        id: 'alert-2',
        severity: 'error',
        message: 'Formula "Trim Door Package" has not been executed in 30 days (potential regression).',
        entityId: 'trim-door-package'
    }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const metricsService = {
    async getRecentEvents(): Promise<TelemetryEvent[]> {
        await delay(250);
        return [...mockEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },

    async getDataQualityAlerts(): Promise<DataQualityAlert[]> {
        await delay(200);
        return [...mockAlerts];
    },

    async generateTrainingExport(): Promise<Blob> {
        await delay(800);
        const exportData = {
            metadata: { exportedAt: new Date().toISOString(), totalRecords: 12500, version: '1.0' },
            events: mockEvents
        };
        return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    }
};

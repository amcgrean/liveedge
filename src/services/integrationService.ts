export interface IntegrationJob {
    id: string;
    reference: string;
    customer: string;
    branch: string;
    status: 'pending' | 'in-progress' | 'complete' | 'synced' | 'failed';
    receivedAt: string;
}

export interface OperationalStats {
    averageLatencyMs: number;
    errorRatePercent: number;
    conversionRatePercent: number;
    manualOverridePercent: number;
}

const mockJobs: IntegrationJob[] = [
    {
        id: 'job-901',
        reference: 'Request-A9X',
        customer: 'Alpha Builders',
        branch: 'Des Moines',
        status: 'synced',
        receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString()
    },
    {
        id: 'job-902',
        reference: 'Request-B4Z',
        customer: 'Horizon Dev',
        branch: 'Ames',
        status: 'complete',
        receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
    },
    {
        id: 'job-903',
        reference: 'Request-C7Y',
        customer: 'Summit Homes',
        branch: 'Des Moines',
        status: 'in-progress',
        receivedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    },
    {
        id: 'job-904',
        reference: 'Request-D2W',
        customer: 'Pioneer Construction',
        branch: 'Grimes',
        status: 'pending',
        receivedAt: new Date(Date.now() - 1000 * 15).toISOString()
    }
];

const stats: OperationalStats = {
    averageLatencyMs: 142,
    errorRatePercent: 1.2,
    conversionRatePercent: 88.5,
    manualOverridePercent: 12.4
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const integrationService = {
    async getIntegrationJobs(): Promise<IntegrationJob[]> {
        await delay(300);
        return [...mockJobs].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    },

    async getOperationalStats(): Promise<OperationalStats> {
        await delay(150);
        return { ...stats };
    },

    async triggerManualSync(jobId: string): Promise<IntegrationJob> {
        await delay(500);
        const jobIndex = mockJobs.findIndex(j => j.id === jobId);
        if (jobIndex === -1) throw new Error('Job not found');
        
        const updatedJob = { ...mockJobs[jobIndex], status: 'synced' as const };
        mockJobs[jobIndex] = updatedJob;
        return updatedJob;
    }
};

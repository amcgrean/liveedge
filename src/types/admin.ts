export type AdminDataType = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';

export interface AdminFieldDefinition {
    id: string;
    section: string;
    label: string;
    path: string;
    dataType: AdminDataType;
    required: boolean;
    metricsPriority: 'high' | 'medium' | 'low';
    description: string;
}

export interface FormulaDefinition {
    id: string;
    name: string;
    output: string;
    owner: string;
    status: 'active' | 'draft' | 'needs-review';
    inputs: string[];
    expression: string;
    notes: string;
}

export interface MetricEventDefinition {
    id: string;
    eventName: string;
    trigger: string;
    payload: string[];
    purpose: string;
}

export interface WorkflowStage {
    id: string;
    title: string;
    source: string;
    destination: string;
    integrationStatus: 'ready' | 'planned' | 'blocked';
    description: string;
}

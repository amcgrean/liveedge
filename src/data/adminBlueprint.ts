import { AdminFieldDefinition, FormulaDefinition, MetricEventDefinition, WorkflowStage } from '../types/admin';

export const adminFieldCatalog: AdminFieldDefinition[] = [
    {
        id: 'setup.branch',
        section: 'Job Setup',
        label: 'Branch',
        path: 'setup.branch',
        dataType: 'enum',
        required: true,
        metricsPriority: 'high',
        description: 'Critical branch context for cost rules, sku mapping, and estimator attribution.',
    },
    {
        id: 'materials.wallSize',
        section: 'Material Selection',
        label: 'Wall Size',
        path: 'materials.wallSize',
        dataType: 'enum',
        required: true,
        metricsPriority: 'high',
        description: 'Primary framing selector that cascades through studs, plates, and deck formula assumptions.',
    },
    {
        id: 'basement.intWallLF',
        section: 'Basement',
        label: 'Interior Wall LF',
        path: 'basement.intWallLF',
        dataType: 'number',
        required: true,
        metricsPriority: 'high',
        description: 'High-signal linear footage input for training takeoff quantity prediction.',
    },
    {
        id: 'roof.sheetingSF',
        section: 'Roof',
        label: 'Roof Sheeting SF',
        path: 'roof.sheetingSF',
        dataType: 'number',
        required: true,
        metricsPriority: 'high',
        description: 'Square footage driver for sheathing, moisture barrier, and labor/risk projections.',
    },
    {
        id: 'siding.splicers',
        section: 'Siding',
        label: 'Include Splicers',
        path: 'siding.splicers',
        dataType: 'boolean',
        required: false,
        metricsPriority: 'medium',
        description: 'Boolean variance signal for finish-package behavior and potential margin drift.',
    },
    {
        id: 'options',
        section: 'Options',
        label: 'Custom Options',
        path: 'options[]',
        dataType: 'array',
        required: false,
        metricsPriority: 'medium',
        description: 'Tracks estimator overrides/custom lines to identify recurring misses in standard formulas.',
    },
];

export const formulaDefinitions: FormulaDefinition[] = [
    {
        id: 'stud-count-basement',
        name: 'Basement Stud Count',
        output: 'lineItems[Framing.Studs.Basement]',
        owner: 'Framing Engine',
        status: 'active',
        inputs: ['basement.ext2x4_8ft', 'basement.ext2x6_10ft', 'multipliers.framing.stud_multiplier_basement'],
        expression: 'sum(exteriorStudInputs) * stud_multiplier_basement',
        notes: 'Should support formula versioning and branch-scoped overrides in the admin portal.',
    },
    {
        id: 'roof-osb-panels',
        name: 'Roof Sheathing Panels',
        output: 'lineItems[Roof.OSB]',
        owner: 'Roof Engine',
        status: 'active',
        inputs: ['roof.sheetingSF', 'materials.roofSheetingSize', 'osbSheeting.sf_per_panel'],
        expression: 'roof.sheetingSF / osbSheeting.sf_per_panel',
        notes: 'Candidate for visual formula editor + inline validation tests before publish.',
    },
    {
        id: 'trim-door-package',
        name: 'Interior Door Trim Package',
        output: 'lineItems[Trim.Doors]',
        owner: 'Trim Engine',
        status: 'needs-review',
        inputs: ['trim.doorCounts.*', 'trim.caseType', 'trimSwitches'],
        expression: 'mapDoorCountsToProfile(trim.caseType) + wasteFactor',
        notes: 'Needs stronger test fixtures and explanation metadata for estimator-facing audit logs.',
    },
];

export const metricEventDefinitions: MetricEventDefinition[] = [
    {
        id: 'bid-input-updated',
        eventName: 'bid_input_updated',
        trigger: 'Any field value changes in takeoff form',
        payload: ['estimate_id', 'field_path', 'previous_value', 'new_value', 'timestamp', 'estimator_id', 'branch_id'],
        purpose: 'Creates sequence data for training how estimators iterate to final quantities.',
    },
    {
        id: 'formula-output-computed',
        eventName: 'formula_output_computed',
        trigger: 'A formula recomputes one or more line items',
        payload: ['estimate_id', 'formula_id', 'formula_version', 'input_snapshot_hash', 'output_qty', 'sku', 'duration_ms'],
        purpose: 'Links each output to formula versions for model explainability and rollback analysis.',
    },
    {
        id: 'estimate-submitted',
        eventName: 'estimate_submitted',
        trigger: 'Estimator exports/sends a bid to downstream systems',
        payload: ['estimate_id', 'customer_code', 'job_name', 'line_item_count', 'confidence_score', 'submitted_at'],
        purpose: 'Defines training label boundaries and tracks conversion to takeoff completeness.',
    },
];

export const estimatingWorkflowStages: WorkflowStage[] = [
    {
        id: 'request-ingestion',
        title: 'Bid Request Intake',
        source: 'Estimating App Repo',
        destination: 'Takeoff Admin API',
        integrationStatus: 'planned',
        description: 'Receive job metadata and project scope to create a normalized estimate workspace.',
    },
    {
        id: 'input-enrichment',
        title: 'Field & Rule Resolution',
        source: 'Takeoff UI',
        destination: 'Formula Service',
        integrationStatus: 'planned',
        description: 'Load branch/customer defaults plus admin-managed formula versions before estimator edits.',
    },
    {
        id: 'quantity-generation',
        title: 'Takeoff Calculation',
        source: 'Formula Service',
        destination: 'Line Item Store',
        integrationStatus: 'ready',
        description: 'Current calculator path that produces grouped line items from live bid inputs.',
    },
    {
        id: 'bid-sync',
        title: 'Bid Sync & Feedback',
        source: 'Line Item Store',
        destination: 'Estimating App Repo',
        integrationStatus: 'planned',
        description: 'Push output bid package + telemetry to estimating app and capture revisions/status outcomes.',
    },
];

export const adminBuildPhases = [
    {
        name: 'Phase 1: Data Governance Foundation',
        outcomes: [
            'Field catalog CRUD with validation rules and ownership metadata.',
            'Formula registry with version history and draft/publish workflow.',
            'Read-only dependency graph showing which formulas consume each field.',
        ],
    },
    {
        name: 'Phase 2: Admin UX + Validation',
        outcomes: [
            'Formula editor with syntax checks and sample input test runner.',
            'Role-based access (admin vs estimator) and change audit timeline.',
            'Preview mode that compares old vs new formula outputs before publish.',
        ],
    },
    {
        name: 'Phase 3: Metrics & Model Readiness',
        outcomes: [
            'Event pipeline for bid input changes, formula execution, and submit outcomes.',
            'Data quality monitors for missing values, abnormal ranges, and stale formulas.',
            'Training dataset export contract linking inputs, versions, outputs, and final revisions.',
        ],
    },
    {
        name: 'Phase 4: Estimating App Integration',
        outcomes: [
            'Cross-repo API contract for request intake and bid sync status.',
            'Idempotent workflow orchestration from request -> takeoff -> approved bid.',
            'Operational dashboards (latency, error rate, manual overrides, conversion).',
        ],
    },
] as const;

# Admin Portal Gameplan

## Goal
Enable non-developer users to manage **field definitions**, **formula logic**, and **takeoff workflow integrations** from the UI while collecting production-quality bid telemetry for ML training.

## Core Admin Modules
1. **Field Registry**
   - CRUD for bid input fields.
   - Data type + validation rules + required flags.
   - Ownership metadata and dependency mapping to formulas.
2. **Formula Registry**
   - Formula authoring with version history.
   - Draft -> review -> publish lifecycle.
   - Inline test harness using real sample payloads.
3. **Telemetry & Metrics**
   - Event stream for bid input changes, formula executions, and estimate submission outcomes.
   - Data quality checks (null rates, out-of-range values, missing lineage).
   - Feature store export contract for model training.
4. **Workflow Integrations**
   - Inbound API from estimating app (new bid requests).
   - Outbound API to estimating app (takeoff outputs, status updates, revision trail).
   - Idempotent orchestration and retry-safe webhook/event handling.

## Near-Term Execution Plan
### Phase 1 - Foundation
- Stand up admin dashboard shell and seed entities for fields/formulas/metrics/workflow.
- Establish canonical schema keys that mirror current `JobInputs`.
- Define API boundaries for future persistence.

### Phase 2 - Editable Admin UI
- Add create/edit dialogs for fields and formulas.
- Introduce permission checks by role.
- Add change audit trail and rollback controls.

### Phase 3 - Model-Ready Instrumentation
- Emit and persist bid input lifecycle events.
- Track formula version lineage on each computed line item.
- Capture submission outcomes and downstream revisions as labels.

### Phase 4 - Cross-Repo Workflow
- Wire estimating app request intake to instantiate takeoff workspaces.
- Push final bid outputs and telemetry back to estimating app.
- Add operational visibility (latency, error rate, manual override frequency).

## Data Needed for ML Training
- Field-level change history (before/after values + timestamps).
- Formula version at compute time for each output line.
- Final accepted bid snapshot and revision delta.
- Source context (branch, estimator, customer segment, job type).

## Open Integration Decisions
- Event transport: queue vs webhooks.
- Single source of truth for formula registry.
- Conflict strategy when estimating app and takeoff admin update the same bid.

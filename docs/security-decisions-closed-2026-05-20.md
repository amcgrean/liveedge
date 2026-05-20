# Security Remediation — Decisions Closed (2026-05-20)

Closes out the four open product/security decisions called out in
`docs/security-remediation-handoff-2026-05-20-finish.md` §"Open decisions".
All four resolved to **status quo** after review with Aaron on 2026-05-20.
Anyone reopening these needs a concrete trigger (incident, audit finding, scale
problem); don't re-litigate without one.

## 1. `scorecard.view` vs `sales.view` — keep bundled

**Decision:** Keep scorecard pages gated by `sales.view`. No new
`scorecard.view` capability.

**Current state:** `app/scorecard/layout.tsx` calls
`requirePageAccess('sales.view')`. The `sales.view` metadata description in
`src/lib/access-control-shared.ts` explicitly says "Access sales order and
customer scorecard experiences."

**Reasoning:** Sales staff legitimately need the scorecard data to do their
job. Splitting would add an admin chore (granting `scorecard.view` to every
new salesperson) without a real least-privilege win — sales-order detail
already exposes the same per-customer financial information.

**Reopen if:** customer financial data ever needs row-level scoping
(e.g. "rep X only sees their accounts"), or if a non-sales role
(driver, picker) ever gets accidentally granted `sales.view`.

## 2. Step-up auth for admin permission changes — skip

**Decision:** No fresh-OTP requirement before permission writes. The existing
protections (capability gate, optimistic lock, last-admin guard, audit log)
are sufficient for the operational risk level.

**Reasoning:** Permission writes are rare and high-friction already
(reason+ticket required, audit logged). A second OTP would frustrate the
day-to-day admin workflow without meaningfully reducing the realistic threat
(session theft is not a credible attack vector for this user base — internal
estimating app behind SSO-style OTP, no public sign-ups).

**Reopen if:** session theft becomes credible (e.g. external auth provider,
public sign-ups, or a real incident).

## 3. Audit log retention — keep indefinitely

**Decision:** No automated retention on `bids.legacy_general_audit`. Rows
accumulate forever. Storage is cheap; long-tail investigations occasionally
need years of history.

**Reasoning:** Permission/audit volume is low (handful of writes per week).
Worst-case at this rate is single-digit GB over a decade. Premature pruning
costs more in investigation friction than it saves in storage.

**Reopen if:** the audit table ever exceeds 10M rows or starts measurably
impacting query performance on the admin audit page.

## 4. Service-route auth: signature vs static Bearer token — keep tokens

**Decision:** Keep static Bearer tokens for service routes
(`CRON_SECRET`, `HUBBELL_UPLOAD_TOKEN`). Don't migrate to HMAC signatures.
The Resend inbound webhook keeps its Svix signature (already implemented).

**Current state:**
- `verifyCronSignature` — Bearer `CRON_SECRET` (`src/lib/service-auth.ts`).
- `verifyHubbellUploadToken` — Bearer `HUBBELL_UPLOAD_TOKEN`.
- `verifyInternalToken` — Bearer `INTERNAL_API_TOKEN`.
- `/api/inbound/credits` — Svix signature (`RESEND_WEBHOOK_SECRET`).

**Reasoning:** Tokens are easy to rotate (Vercel env var bump) and the Pi
scraper + monthly-recon scripts are operated by a single party who can update
their `.env` quickly. HMAC would mean updating two non-LiveEdge codebases
to sign requests every time we add a new field, with no real-world replay
risk against authenticated internal endpoints.

**Reopen if:** a service token leaks publicly, or a new caller needs replay
protection that static tokens can't provide.

## What this closes

After this commit, the security remediation master plan
(`docs/security-remediation-master-plan-2026-05-14.md`) is fully resolved:

| Phase | Status |
|---|---|
| PR1 — CI Guard Scanner | ✅ |
| PR2 — Service-auth Standardization | ✅ (per decision #4: static tokens are the standard) |
| PR3 — Page Guard Consistency | ✅ |
| PR4 — Capability Catalog SSoT | ✅ (parity test = follow-up, not blocking) |
| PR5 — Permission Governance Hardening | ✅ |
| PR6 — Tests + Telemetry + Runbook | ✅ |
| Open decisions | ✅ (this doc) |

Remaining follow-up work, none blocking:
- Three superseded `claude/*` + `codex/*` branches still need GitHub-UI
  deletion (the harness's git creds lack delete-ref permission).
- PR4 parity test: automated check that `GET /api/admin/capabilities`
  matches the admin UI's rendered tabs. Tractable now that Vitest is in
  the repo.

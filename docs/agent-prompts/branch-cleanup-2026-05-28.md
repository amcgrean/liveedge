# Branch cleanup handoff — 2026-05-28

The repo has 98 non-main remote branches. A web-session agent analyzed them
and produced this triage. The web session could not delete branches (the
local git proxy returns HTTP 403 on `git push --delete`, and the GitHub MCP
tools surfaced in that environment had no `delete_branch` capability). Hand
this to a local agent with `gh` CLI or full GitHub API access.

Repo: `amcgrean/liveedge`. All branches below are on `origin`.

## How the triage was built

For each branch:
- `merged_by_subject`: the branch tip's commit subject (after stripping
  `(#NNN)`) matches a commit subject on `main` — the canonical squash-merge
  pattern in this repo
- `merged_by_cherry`: `git cherry origin/main <branch>` shows 0 unique
  commits (every patch has an equivalent on main)
- `superseded_by_audit`: CLAUDE.md's "Open Branches Audit (2026-05-20)"
  section flags it
- `keep`: branch has unique, non-trivial, useful work not on main

If two signals say "merged" the branch is safe to delete. If the only
signal is `superseded_by_audit`, spot-check before deleting.

## Phase 1: safe to delete (68 branches)

These passed at least one merge check AND aren't on the per-branch keep
list. Delete with:

```bash
for br in <list below>; do
  gh api -X DELETE "/repos/amcgrean/liveedge/git/refs/heads/$br" \
    && echo "deleted $br" || echo "FAILED $br"
done
```

### Tip subject matches a main commit (squash-merged, 65)

```
claude/hubbell-jobsite-reconciler-docs
claude/dispatcher-load-completion-alert-40Ouz
claude/hubbell-jobsite-number-mismatch
claude/hubbell-parent-component-demote
claude/dispatch-slice-refactor
claude/hubbell-r2-key-hash
claude/docs-stale-sweep
claude/hubbell-jobsite-reconcile-handoff
claude/item-scorecard-replenishment
claude/document-hubbell-review-floor
claude/hubbell-cli-repull-collision
claude/hubbell-neg-total-and-add
claude/hubbell-cli-lower-fetch-mult
claude/fix-hubbell-suggestions-perf
claude/fix-hubbell-suggestions-so-join
claude/hubbell-review-cli
claude/workspace-redesign
claude/docs-perf-audit-handoff
claude/ci-security-scans
claude/hubbell-ai-review
claude/hubbell-door-subtype-twotier
claude/deploy-kick-dispatch-token
claude/hubbell-door-subtype-symmetric
claude/docs-pi-topology
claude/hubbell-stale-divergent-rescrape
claude/hubbell-backfill-restore
claude/hubbell-skip-superseded
claude/hubbell-line-items-reextract-handoff
claude/app-performance-issues-Hgx9B
claude/fix-gps-job-loading-IAYiF
claude/lucid-thompson-d7f94e
claude/hubbell-docs-update
claude/hubbell-jobs-pdf-preview
claude/docs-open-branches-audit
claude/hubbell-upload-line-items-normalize
claude/security-remediation-finish-handoff
claude/hubbell-pdf-panel-fix
claude/hubbell-need-by-date-format
claude/hubbell-needs-extraction-endpoint
claude/security-decisions-recorded
claude/hubbell-job-ar-open-and-allstatus
claude/fix-db-execute-rows-bug
claude/security-pr4-parity-test
claude/suggested-buys-filters-export
claude/docs-pending-actions-update
claude/ci-add-vitest
claude/fix-ar-open-type-cast
claude/hubbell-checks-migration-0026
claude/fix-hubbell-checks-migration
claude/hubbell-read-endpoints
claude/fix-hubbell-checks-endpoint
claude/fix-hubbell-checks-inv-resolver
claude/fix-hubbell-checks-line-dedupe
claude/buyers-workspace-planning-1ZMmm
claude/report-email-subscriptions-Sa2Ck
claude/report-subs-docs-followup
claude/item-planning-schema
claude/item-planning-admin-ui
claude/hubbell-suggested-matches
claude/replenishment-engine
claude/purchasing-outages-page
claude/suggested-buys-rebuild
claude/hubbell-suggest-mobile-trigger
claude/hubbell-payment-autolink
claude/hubbell-payments-import   # also fix-only, no new feature work
docs/sync-geocode-pi-handoff
```

### Tip subject differs but `git cherry` shows 0 unique commits (3)

These are already on main, just with a different SHA from the squash:

```
claude/docs-mark-security-complete
claude/docs-purchasing-supplier-rules-followup
claude/purchasing-suggested-buys-rules
```

## Phase 2: superseded per CLAUDE.md audit — verify diff, then delete (12)

The 2026-05-20 "Open Branches Audit" section in CLAUDE.md flags these as
already shipped via a renumbered PR (squash rewrites SHAs so `git cherry`
can't see the equivalence). Quick verify recipe:

```bash
# Pick any file in the branch's diff and compare against main:
git diff origin/main...origin/<branch> -- <a_file> | head -50
# If main already has the change in equivalent form, delete.
```

```
claude/hardcore-dirac-8d92f4               # filter active_flag=true in suggested-buys — landed via #296/#299
claude/keen-mcnulty-c72043                  # forecast UI port — landed via #306–#312
claude/hubbell-jobs-source-from-agility    # jobs page rewrite — landed via #338
claude/hubbell-jobs-address-only           # earlier iteration of #338
claude/hubbell-job-detail-address-match    # landed via #332
claude/loving-chatelet-e3363c              # follow-up on #338/#340 — verify Codex comments closed
claude/hubbell-doc-context                 # system_id scope on order_total LATERAL — check vs PRs that landed
claude/hubbell-rematch-and-docs            # confirm /api/admin/hubbell/documents/rematch in main matches
claude/hubbell-metadata-bulk-endpoint      # confirm /metadata-bulk in main has Codex P1 fix
claude/eager-cerf-b5b272                   # geocoding docs — conflicts with current CLAUDE.md, likely subsumed
claude/merge-admin-permissions-prs-nJDm6   # ahead 6, claims to be docs note for #339
codex/continue-work-on-security-remediation        # status doc only, security work landed
codex/continue-work-on-security-upgrade-plan       # PR1/P1/P2 fix attempt — fixes landed via #349
```

## Phase 3: review and decide (8 branches)

These have non-trivial unique work that's NOT clearly already on main.
Owner should look at each before deleting.

### Likely worth merging — small focused fixes

1. **`claude/hubbell-door-subtype-mismatch`** (last 19h, 2 commits, 55-line
   diff to `src/lib/hubbell/jobsite-reconciler.ts`)
   - First commit "feat(hubbell): demote door-subtype mismatch (patio SO
     vs interior-doors doc)" is in main as PR #423. The second commit
     `f5c43be7 fix(hubbell): recompute hasSpecificOverlap after demote
     rules` is a follow-up fix that does NOT appear in main.
   - **Action**: cherry-pick `f5c43be7` onto main → small standalone PR.

2. **`claude/dispatch-agility-route-completion`** (last 18h, 2 commits, 9
   files, +602/-126)
   - First commit `d37727a2 feat(dispatch): Agility-sourced route
     completion alerts` matches main's PR #426.
   - Second commit `2e367e22 fix(route-guards): register
     agility-route-complete + verifyDispatchSyncToken` adds the
     `agility-route-complete` route into `scripts/check-route-guards.mjs`
     and adds `verifyDispatchSyncToken` helper.
   - **Action**: verify whether the route-guard registration shipped in
     a later main PR; if not, cherry-pick to a small PR.

3. **`claude/mgmt-pages-timeout-b9ofE`** (last 26 min, 3 commits, single
   341-line new doc `docs/agent-prompts/mgmt-api-count-probe-fix-2026-05-28.md`)
   - The first two doc commits are in main (PR #428). This branch has a
     newer iteration "tighten mgmt-api handoff per Pi-agent review".
   - **Action**: check whether the file already exists on main; if yes,
     diff to see if the tightened version supersedes it.

4. **`fix/scorecard-include-hold-doorhold`** (last 24h, 2 commits, 5 files,
   +31/-36)
   - First commit "Include HOLD/DOORHOLD sale types in scorecard
     aggregates" matches main PR #413. The second commit
     `f7e87238 fix(scorecard): reclassify HOLD/DOORHOLD at query layer,
     restore isExcluded filter` looks like a refactor of how #413
     classified those statuses.
   - **Action**: owner-decision — this is a "do it differently" follow-up,
     not a bug fix. Diff against current `src/lib/scorecard/queries.ts`
     to decide whether the query-layer approach is preferred.

5. **`claude/top-items-return-analysis-OikCI`** (last 63 min, 4 commits, +
   merge of main, new 41 KB xlsx at `docs/returns-analysis-2026-05-27.xlsx`)
   - Earlier xlsx iterations are in main (#416, #427). This is a newer
     rebuild with "reconciling fresh data".
   - **Action**: confirm with owner which xlsx is canonical; if this one
     is newer, push to main as a single commit, then delete branch.

### Stale, large-diff, or known-deferred

6. **`claude/hubbell-jobsite-tuning`** and **`claude/hubbell-jobsite-reconcile`**
   (last 2d, 4–5 commits, 5 files, identical 110/7 diff)
   - Both have the SAME commit subject and diff. Almost certainly two
     parallel branches of the same Codex work — and the subject matches
     main PR #404 ("feat(hubbell): tune jobsite reconciler + suggestions
     perf + --source CLI").
   - **Action**: spot-check that #404 actually contains the broad-only
     scope suppression rule; if yes, delete both. If not, cherry-pick
     ONE of them.

7. **`claude/dallas-county-loader`** (47 commits, 2 weeks old, 10 files)
   - CLAUDE.md Pending Actions #7 explicitly marks Dallas County loader
     as MOVED TO PI; the TS loader in this branch is now inert reference
     only.
   - **Action**: confirm the Python equivalent is on the Pi side; this
     branch's TS work is superseded by the Pi-side Python loader. Delete.

8. **`claude/security-pr6-tests-telemetry`** (8d, 2 unique commits, 6
   files, +1676/-47)
   - The big diff is from a stale base; the unique commit is just
     "fix(test): mirror @/db tsconfig alias in vitest resolver".
   - **Action**: check if vitest config on main already has the alias; if
     yes, delete. The other security-PR6 work landed via #351.

### Old code-author branches — owner should not touch without coordination

```
claude/security-remediation-handoff-aQu3b
claude/update-hubbell-agent-notes-ehKCe
claude/page-tracking-remaining-clients   # docs-only, mostly likely superseded by PR #359
claude/fix-job-route-regex-escape        # Codex follow-up; check if escape fix landed
```

## Phase 4: after Phase 3 decisions

Once Phase 3 branches are resolved (either merged or deleted), the repo
will be down from 98 → 0 non-main `claude/*` and `codex/*` branches except
the one this prompt is on (`claude/hopeful-galileo-w2j6Q`). Delete that
last after the cleanup PR merges.

## Verification commands

```bash
# Before any delete, run:
gh api /repos/amcgrean/liveedge/pulls?state=open --jq '.[].head.ref'
# — make sure none of the branches you're about to delete have an open PR.

# Confirm remote count after cleanup:
gh api /repos/amcgrean/liveedge/branches --paginate --jq '.[].name' | wc -l
```

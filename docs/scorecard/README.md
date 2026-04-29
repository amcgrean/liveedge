# Customer Scorecard Handoff Package

This package is a handoff for another agent to continue work on the **Customer Scorecard** built from the original paper/mockup reference.

## Included files

- `01-project-overview.md` — purpose, current status, and intended behavior
- `02-sql-view-design.md` — SQL view design and normalization rules
- `03-tableau-scorecard-build.md` — Tableau workbook/dashboard build instructions
- `04-calculated-fields-reference.md` — Tableau calculated fields to use going forward
- `05-open-items-and-validation.md` — remaining issues, validations, and next steps
- `06-current-view-sql.md` — current SQL view with recommended sale type normalization changes documented

## Current state summary

The scorecard has already been substantially built in Tableau and is based on `analytics.vw_customer_scorecard_fact`.

Key progress already made:

- Built customer scorecard layout from original reference image
- Created SQL fact view for Tableau consumption
- Added ship-to, branch, stock/non-stock, and value-add flags
- Added sale type normalization so `OrderType = 'CM'` is classified as `Credit`
- Added Tableau dashboard with KPIs and tables
- Began refactor from `CY/LY` logic to more robust `Base/Compare` year logic
- Added support for comparing arbitrary years and YTD vs Full Year in Tableau

## Recommended source of truth going forward

Use **Base/Compare** logic everywhere in Tableau, not `CY/LY` logic.

That means all sheets should be updated to use:

- `pBaseYear`
- `pCompareYear`
- `pPeriod`
- `Is Base Period`
- `Is Compare Period`
- `Base Sales / Compare Sales`
- `Base GP / Compare GP`
- `Base GM% / Compare GM%`

The old `CY` / `LY` calculated fields should be considered legacy and only removed after confirming no sheets still depend on them.

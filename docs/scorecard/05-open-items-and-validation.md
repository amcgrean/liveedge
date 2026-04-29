# 05 - Open Items and Validation

## Already validated

### Sale type normalization
Spot check result:

- `CM / WILLCALL` normalized to `CREDIT / Credit`
- `SO / WILLCALL` remains `WILLCALL / Will Call`

This is correct.

### SQL validation query result
Observed:

- `CM WILLCALL CREDIT Credit` with large negative sales total
- `SO WILLCALL WILLCALL Will Call` with positive sales total

This behavior is expected and correct.

## Immediate next steps after SQL changes

### 1. Refresh Tableau extracts
Required because business logic changed in the SQL view.

### 2. Validate these sheets after refresh
- Sales KPI
- GP KPI
- GM% KPI
- Sales by Sale Type
- Sales by Product Major
- Value Add %
- Non-Stock %

### 3. Confirm Will Call and Credit buckets
The Sale Type table should no longer show credit memo behavior under Will Call.

## Known remaining work

### 1. Finish converting all Tableau sheets off CY/LY fields
Any remaining `CY` / `LY` fields should be retired after validation.

### 2. Replace customer parameter with normal customer filter
Desired end state:
- one customer
- multiple customers
- all customers

### 3. Decide leap-day behavior in compare calculations
If YTD comparisons will span leap years and use a Feb 29 cutoff, clamp compare year cutoff to end-of-month.

### 4. Confirm whether Credit rows should remain in Sale Type tables
Current assumption:
- keep Credit rows visible
- do not exclude them

## Suggested validation checks in Tableau

### Sales KPI
- flip base/compare years and confirm direction reverses correctly
- switch between YTD and Full Year

### Sale Type table
- Will Call GM% should be more reasonable after CM normalization
- Credit bucket should absorb CM behavior

### Product Major table
- totals should tie to KPI totals when grouped appropriately

## Suggested future enhancements (not required for immediate handoff)
- add order count / avg order $ KPIs
- add days to pay if AR data becomes available
- add quote win % if quote data becomes available
- add dashboard toggle for detail tables

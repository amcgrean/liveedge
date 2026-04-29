# 03 - Tableau Scorecard Build

## Workbook concept

This should be a separate Tableau workbook dedicated to the customer scorecard rather than modifying older workbooks built on the previous sales history view.

## Tableau data source

Connect to:

`analytics.vw_customer_scorecard_fact`

## Parameter controls

### Required parameters
- `pBaseYear` (integer)
- `pCompareYear` (integer)
- `pPeriod` (`YTD`, `Full Year`)

### Desired customer experience
- year pickers visible on dashboard
- period selector visible on dashboard
- customer selection should be a normal filter, ideally supporting single, multiple, or all customers

## Worksheet inventory

### `01 Header`
Purpose:
- display customer / branch / compare context

Suggested displayed fields:
- `Customer Display`
- `Branch Display`
- `Compare Title`
- `Compare Period Label`

### `02 KPI - Sales`
Uses:
- `Sales - Base`
- `Sales - Compare`
- `Sales - Delta`
- `Sales - Sign`
- optional `Sales - Arrow`

### `03 KPI - GP`
Uses:
- `GP - Base`
- `GP - Compare`
- `GP - Delta`
- `GP - Sign`
- optional `GP - Arrow`

### `04 KPI - GM%`
Uses:
- `GM% - Base`
- `GM% - Compare`
- `GM% - Delta`
- `GM% - Sign`
- optional `GM% - Arrow`

### `05 Sales by Sale Type`
Rows:
- `SaleTypeReportingCategory`

Columns / displayed measures:
- `Sales - Base`
- `Sales - Compare`
- `GP - Base`
- `GP - Compare`
- `GM% - Base`
- `GM% - Compare`

### `06 Sales by Product Major`
Rows:
- `ProductMajor`

Displayed measures:
- `Sales - Base`
- `Sales - Compare`
- `GP - Base`
- `GP - Compare`
- `GM% - Base`
- `GM% - Compare`

### `07 KPI - Value Add %`
Uses:
- `Value Add % - Base`
- `Value Add % - Compare`
- optional delta / sign

### `08 KPI - Non-Stock %`
Uses:
- `Non-Stock % - Base`
- `Non-Stock % - Compare`
- optional delta / sign

## Dashboard layout

### Top area
- customer filter
- base year parameter
- compare year parameter
- period parameter
- header sheet

### KPI row
- Sales
- GP
- GM%
- Value Add %
- Non-Stock %

### Table row
- Sales by Sale Type
- Sales by Product Major

## Important Tableau notes

### 1. Stop using CY/LY in the new workbook
Legacy `CY` / `LY` fields should be phased out. The scorecard should now be entirely driven by Base/Compare fields.

### 2. Use normal customer filters
The desired end state is a normal Tableau filter for customer selection instead of a strict single-customer parameter.

### 3. Table logic
The Sale Type and Product Major tables should use **Measure Names / Measure Values** with Base/Compare fields.

### 4. KPI sign coloring
KPI tiles should color by sign field:
- `Up` = green
- `Down` = red
- `Flat` = gray

### 5. Header wording
Avoid displaying `CY` / `LY` in the header once Base/Compare logic is active.
Use labels like:
- `2025 vs 2024`
- `YTD thru 2025-01-21`
- `Full Year`

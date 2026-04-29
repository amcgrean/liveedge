# 01 - Project Overview

## Objective

Build a Tableau-based **Customer Scorecard** that matches the original scanned/paper scorecard as closely as practical, using a SQL fact view and parameter-driven year comparison logic.

## Primary business use

The scorecard should let a user:

- Review one customer or multiple customers
- Compare performance between two selected years
- Toggle between `YTD` and `Full Year`
- Review both top-level KPIs and supporting breakdowns

## Final intended scorecard sections

### Header
- Customer display
- Branch display (or `Multiple Branches`)
- Compare title, for example `2025 vs 2024`
- Period label, for example `YTD thru 2025-01-21` or `Full Year`

### KPI row
- Sales
- Gross Profit
- Gross Margin %
- Value Add % of Sales
- Non-Stock % of Sales

### Supporting breakdown tables
- Sales by Sale Type
- Sales by Product Major

## Important design decisions already made

### 1. SQL view grain
The fact view is at the **shipment line / invoice line** level and includes:

- customer
- branch
- ship-to
- sale type
- order type
- product major/minor
- stock/non-stock flag
- value-add flag
- allocated sales amount
- cost amount
- gross profit

### 2. Sale type normalization
The raw `sale_type` is not enough by itself because some users entered credit memos with sale type like `WillCall`.

The view now must normalize sale type based on **`so_header.type`**:

- `OrderType = 'CM'` must bucket to `Credit`
- `OrderType = 'SO'` keeps normal sale type mapping

### 3. Tableau compare model
The scorecard should no longer depend on `Current Year vs Last Year` only.

Instead it should use:

- `pBaseYear`
- `pCompareYear`
- `pPeriod` (`YTD` or `Full Year`)

This allows:

- 2025 vs 2024
- 2024 vs 2023
- 2025 vs 2025 if desired
- YTD or full-year comparisons

### 4. Customer selection
The scorecard originally used a single-customer parameter. The desired end state is to support:

- one customer
- multiple customers
- all customers

This should be done with a **normal Tableau customer filter** rather than a strict single-customer parameter.

## Current status

### SQL layer
Mostly complete.

### Tableau layer
Mostly complete, but some sheets were originally built on `CY/LY` fields and are being converted to `Base/Compare` fields.

### Remaining work
- finish converting all sheets from `CY/LY` to `Base/Compare`
- confirm customer selection should use a normal filter instead of parameter-only selection
- refresh Tableau extracts after SQL changes
- validate table outputs after sale type normalization

# 02 - SQL View Design

## View name

`analytics.vw_customer_scorecard_fact`

## Purpose

Provide a Tableau-friendly fact view for the customer scorecard with one row per invoice/shipment line and all core dimensions and flags required for scorecard reporting.

## Required output columns

### Document / date
- `ShipmentDate`
- `InvoiceDate`
- `SalesOrderNumber`
- `OrderDate`
- `ShipmentNumber`
- `ShipmentSequence`
- `ShipmentLineKey`

### Customer / org
- `CustomerID`
- `CustomerName`
- `ShipToID`
- `ShipToName`
- `BranchID`
- `BranchName`

### Sales type / order type
- `OrderType`
- `SaleTypeRaw`
- `SaleType` (normalized)
- `SaleTypeReportingCategory`
- `IsSaleTypeExcluded`
- `IsCredit`
- `IsCreditMemo`

### Product / line
- `LineID`
- `ItemNumber`
- `ItemDescription`
- `ProductMajorCode`
- `ProductMinorCode`
- `ProductMajor`
- `ProductMinor`

### Measures
- `QtyShipped`
- `SalesAmount`
- `CostAmount`
- `GrossProfit`
- `GrossMarginPct`
- `Weight`

### Flags
- `IsStock`
- `IsNonStock`
- `IsValueAddMajor`

### Date helpers
- `AsOfDate`
- `CutoffCY`
- `CutoffLY`
- `IsCYTD`
- `IsLYTD`

## Key business logic

### Sale type normalization
Use `OrderType` to correct misclassified sale types.

#### Rule
- If `OrderType = 'CM'`, force:
  - `SaleType = 'CREDIT'`
  - `SaleTypeReportingCategory = 'Credit'`
  - `IsCredit = 1`
  - `IsSaleTypeExcluded = 0`

#### Why
Users sometimes entered credit memos using sale types like `WillCall`, which distorted the Sale Type table and margin calculations.

### Sale type reporting bucket mapping
For non-CM orders:

- `ADD ON` -> `Delivery`
- `DELIVERY` -> `Delivery`
- `WILLCALL` -> `Will Call`
- `DIRECT` -> `Direct`
- `CREDIT` -> `Credit`
- `SERVICE` -> `Service`
- `XINSTALL` -> `Install`
- `TRANSFER` -> `exclude`
- `DOORHOLD` -> `exclude`
- `HOLD` -> `exclude`
- `XCONTRAC` -> `exclude`
- `XFERDIR` -> `exclude`
- else -> `Other`

### Stock / non-stock
Non-stock is driven by:

- `so_detail.linked_tran_type = 'PO'`

Then:
- `IsNonStock = 1`
- `IsStock = 0`

### Value add majors
Current value-add flag is major-code driven.

Value add majors:
- `200` Engineered Wood Products
- `275` Decking-Composite
- `500` Exterior Doors
- `520` Interior Doors
- `550` Interior Trim
- `600` Windows-Premium
- `620` Windows-Vinyl

### Pricing / allocation
The view already includes allocation logic for grouped lines and price-header-only logic. That logic should remain intact.

## Recommended SQL change already validated
The normalized sale type logic is correct if spot checks show:

- `CM + SaleTypeRaw = WILLCALL` => `SaleType = CREDIT`, `SaleTypeReportingCategory = Credit`
- `SO + SaleTypeRaw = WILLCALL` => `SaleType = WILLCALL`, `SaleTypeReportingCategory = Will Call`

A spot check already confirmed this behavior.

# 06 - Current View SQL and Required Normalization Notes

Below is the current `analytics.vw_customer_scorecard_fact` SQL context and the specific change that was required for sale type normalization.

## Required final-select sale type block

Replace the sale type output block with this normalized version:

```sql
/* ---------------------------
   Sale Type normalization
   - If it's a credit memo (CM), force it to Credit
   - Otherwise use the sale_type bucket logic you already had
   --------------------------- */

p.SaleType AS SaleTypeRaw,

CASE 
    WHEN p.OrderType = 'CM' THEN 'CREDIT'
    ELSE p.SaleType
END AS SaleType,

CAST(CASE 
    WHEN p.OrderType = 'CM' THEN 1
    WHEN p.SaleType = 'CREDIT' THEN 1
    ELSE 0
END AS bit) AS IsCredit,

CASE 
    WHEN p.OrderType = 'CM' THEN 'Credit'
    ELSE
        CASE p.SaleType
            WHEN 'ADD ON'   THEN 'Delivery'
            WHEN 'DELIVERY' THEN 'Delivery'
            WHEN 'WILLCALL' THEN 'Will Call'
            WHEN 'DIRECT'   THEN 'Direct'
            WHEN 'CREDIT'   THEN 'Credit'
            WHEN 'SERVICE'  THEN 'Service'
            WHEN 'XINSTALL' THEN 'Install'
            WHEN 'TRANSFER' THEN 'exclude'
            WHEN 'DOORHOLD' THEN 'exclude'
            WHEN 'HOLD'     THEN 'exclude'
            WHEN 'XCONTRAC' THEN 'exclude'
            WHEN 'XFERDIR'  THEN 'exclude'
            ELSE 'Other'
        END
END AS SaleTypeReportingCategory,

CAST(CASE
    WHEN p.OrderType = 'CM' THEN 0
    WHEN p.SaleType IN ('TRANSFER','DOORHOLD','HOLD','XCONTRAC','XFERDIR') THEN 1
    ELSE 0
END AS bit) AS IsSaleTypeExcluded,

CAST(CASE WHEN p.OrderType = 'CM' THEN 1 ELSE 0 END AS bit) AS IsCreditMemo,
```

## Why this matters

Without this change, credit memos entered with raw sale type `WILLCALL` were distorting:

- Sale Type reporting buckets
- Will Call sales totals
- Will Call GM%
- KPI interpretation

## Validated spot-check output

```text
OrderType  SaleTypeRaw  SaleType  SaleTypeReportingCategory  Sales
CM         WILLCALL     CREDIT    Credit                     -24204101.296551
SO         WILLCALL     WILLCALL  Will Call                  92833900.589366
```

This is the desired behavior.

## Full current view context

The active working view includes:

- normalized customer / branch / ship-to fields
- sale type normalization hooks
- price allocation logic
- stock / non-stock flags
- value-add flags
- YTD helper fields (`IsCYTD`, `IsLYTD`) retained for backward compatibility

These YTD helper fields can remain in the view for now, but Tableau should move to Base/Compare logic.

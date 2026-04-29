# 04 - Calculated Fields Reference

## Parameters

### `pBaseYear`
Integer parameter.
Default should be current year.

### `pCompareYear`
Integer parameter.
Default should be prior year.

### `pPeriod`
String parameter:
- `YTD`
- `Full Year`

## Core comparison engine

### `Base Year`
```tableau
[pBaseYear]
```

### `Compare Year`
```tableau
[pCompareYear]
```

### `Cutoff Month`
```tableau
DATEPART('month', [Cutoff CY])
```

### `Cutoff Day`
```tableau
DATEPART('day', [Cutoff CY])
```

### `Is Base Period`
```tableau
IF [pPeriod] = "Full Year" THEN
    YEAR([Invoice Date]) = [pBaseYear]
ELSE
    YEAR([Invoice Date]) = [pBaseYear]
    AND [Invoice Date] <= MAKEDATE([pBaseYear], [Cutoff Month], [Cutoff Day])
END
```

### `Is Compare Period`
```tableau
IF [pPeriod] = "Full Year" THEN
    YEAR([Invoice Date]) = [pCompareYear]
ELSE
    YEAR([Invoice Date]) = [pCompareYear]
    AND [Invoice Date] <= MAKEDATE([pCompareYear], [Cutoff Month], [Cutoff Day])
END
```

> Note: if leap-day handling is required, clamp the day to end-of-month for the compare year.

## Sales

### `Sales - Base`
```tableau
SUM( IF [Is Base Period] THEN [Sales Amount] END )
```

### `Sales - Compare`
```tableau
SUM( IF [Is Compare Period] THEN [Sales Amount] END )
```

### `Sales - Delta`
```tableau
[Sales - Base] - [Sales - Compare]
```

### `Sales - Sign`
```tableau
IF [Sales - Delta] > 0 THEN "Up"
ELSEIF [Sales - Delta] < 0 THEN "Down"
ELSE "Flat"
END
```

### `Sales - Arrow`
```tableau
IF [Sales - Sign] = "Up" THEN "▲"
ELSEIF [Sales - Sign] = "Down" THEN "▼"
ELSE "—"
END
```

## Gross Profit

### `GP - Base`
```tableau
SUM( IF [Is Base Period] THEN [GrossProfit] END )
```

### `GP - Compare`
```tableau
SUM( IF [Is Compare Period] THEN [GrossProfit] END )
```

### `GP - Delta`
```tableau
[GP - Base] - [GP - Compare]
```

### `GP - Sign`
```tableau
IF [GP - Delta] > 0 THEN "Up"
ELSEIF [GP - Delta] < 0 THEN "Down"
ELSE "Flat"
END
```

## Gross Margin %

### `GM% - Base`
```tableau
IF SUM( IF [Is Base Period] THEN [Sales Amount] END ) <= 0 THEN NULL
ELSE
    SUM( IF [Is Base Period] THEN [Gross Profit] END )
    /
    SUM( IF [Is Base Period] THEN [Sales Amount] END )
END
```

### `GM% - Compare`
```tableau
IF SUM( IF [Is Compare Period] THEN [Sales Amount] END ) <= 0 THEN NULL
ELSE
    SUM( IF [Is Compare Period] THEN [Gross Profit] END )
    /
    SUM( IF [Is Compare Period] THEN [Sales Amount] END )
END
```

### `GM% - Delta`
```tableau
[GM% - Base] - [GM% - Compare]
```

### `GM% - Sign`
```tableau
IF [GM% - Delta] > 0 THEN "Up"
ELSEIF [GM% - Delta] < 0 THEN "Down"
ELSE "Flat"
END
```

## Value Add %

### `Value Add Sales - Base`
```tableau
SUM( IF [Is Base Period] AND [IsValueAddMajor] = 1 THEN [Sales Amount] END )
```

### `Value Add Sales - Compare`
```tableau
SUM( IF [Is Compare Period] AND [IsValueAddMajor] = 1 THEN [Sales Amount] END )
```

### `Total Sales - Base`
```tableau
SUM( IF [Is Base Period] THEN [Sales Amount] END )
```

### `Total Sales - Compare`
```tableau
SUM( IF [Is Compare Period] THEN [Sales Amount] END )
```

### `Value Add % - Base`
```tableau
IF [Total Sales - Base] = 0 THEN NULL
ELSE [Value Add Sales - Base] / [Total Sales - Base]
END
```

### `Value Add % - Compare`
```tableau
IF [Total Sales - Compare] = 0 THEN NULL
ELSE [Value Add Sales - Compare] / [Total Sales - Compare]
END
```

## Non-Stock %

### `Non-Stock Sales - Base`
```tableau
SUM( IF [Is Base Period] AND [IsNonStock] = 1 THEN [Sales Amount] END )
```

### `Non-Stock Sales - Compare`
```tableau
SUM( IF [Is Compare Period] AND [IsNonStock] = 1 THEN [Sales Amount] END )
```

### `Non-Stock % - Base`
```tableau
IF [Total Sales - Base] = 0 THEN NULL
ELSE [Non-Stock Sales - Base] / [Total Sales - Base]
END
```

### `Non-Stock % - Compare`
```tableau
IF [Total Sales - Compare] = 0 THEN NULL
ELSE [Non-Stock Sales - Compare] / [Total Sales - Compare]
END
```

## Header / display helpers

### `Compare Title`
```tableau
STR([Base Year]) + " vs " + STR([Compare Year])
```

### `Compare Period Label`
```tableau
IF [pPeriod] = "Full Year" THEN
    "Full Year"
ELSE
    "YTD thru " + STR(MAKEDATE([Base Year], [Cutoff Month], [Cutoff Day]))
END
```

### `Branch Display`
```tableau
IF COUNTD([BranchID]) = 1 THEN MIN([BranchID])
ELSE "Multiple Branches"
END
```

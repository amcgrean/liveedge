# Unmatched Geocoding Addresses — 2026-05-01

After today's nightly geocode runs (PR #204, #205, #211 fixes), 14,766 IA
customers in `agility_customers` still couldn't be matched against the
OpenAddresses index. Total geocoded customers went from 76,538 → 86,735
(+10,197) on this run.

This dump classifies the residual 14,766 into three buckets so the team can
prioritize cleanup vs. accept the OA coverage floor.

## Open in Excel
Open `unmatched_addresses_2026-05-01.xlsx` — three sheets:

| Sheet | Rows | Meaning |
|---|---|---|
| **Good Data (OA gap)** | 5,722 | Address parses cleanly, city is in the IA OA dataset, but the specific number+street combo isn't. Likely real address, just OA coverage gap. Dispatch can use these — they're deliverable. |
| **Potentially Fuzzy** | 2,110 | Address parses cleanly AND the same number+city+first-street-word exists in the index. Suggests minor typo, missing direction suffix, or street-type mismatch. The `suggested_index_match` column shows the closest hit. |
| **Bad Data** | 6,934 | Doesn't look like a real address. The `reason` column says why: `no_leading_number`, `no_street_type`, or `junk_keyword` (Job/Site/Quote/Will Call/etc.). Customer record needs cleanup. |

CSV equivalents alongside (`good_data.csv`, `potentially_fuzzy.csv`,
`bad_data.csv`) for anyone who wants to pipe into other tools.

## Classification rules

A row lands in a bucket based on its `address_1`:

```
bad_data:
  - address_1 doesn't start with leading digits + space + non-space
  - OR contains JOB/SITE/QUOTE/PURCHASES/SHOW/WILL CALL/CASH/GENERAL/
    WAREHOUSE/SAMPLE/TEST keywords
  - OR has no recognizable street-type word
  - OR city isn't in the IA OpenAddresses dataset

potentially_fuzzy:
  - parses cleanly (number + street + recognized type)
  - city is in the IA OA dataset
  - exists at least one row in geocode_index with same number_norm,
    same city_norm, and street_norm starting with the customer's
    first-street-word

good_oa_gap:
  - parses cleanly
  - city is in OA
  - but no fuzzy match → genuine coverage gap on that street/number
```

## Next steps if anyone wants to fix the matchers

- **Potentially Fuzzy (2,110)** — add a 4th match tier: drop trailing
  direction suffix, fuzzy street-name match (Levenshtein ≤ 2). Could
  recover a chunk of these.
- **Bad Data (6,934)** — bulk customer record cleanup in Agility ERP.
  Most of the `junk_keyword` rows are job-site placeholders that should
  probably be filtered out at sync time, not stored as ship-to addresses.
- **Good OA Gap (5,722)** — paid geocoder fallback (Google/Mapbox/etc.)
  if the dispatch use case needs them, or wait for OpenAddresses' next
  IA refresh which may add more county-level coverage.

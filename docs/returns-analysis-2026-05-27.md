# Returns Analysis — Sales & Operations Handoff

**Reporting period:** May 27, 2025 – May 27, 2026 (trailing 12 months)
**Prepared:** May 27, 2026
**Data source:** `customer_scorecard_fact` (Agility ERP mirror) joined to `agility_so_header` for rep attribution. All credit memos in scope (`sale_type = 'Credit'`).

---

## 1. Executive Summary

Beisser's blended return rate over the trailing 12 months is **4.77%** — $5.40M in credits against $113.18M in shipped sales across 35,201 credit lines. Most of that ($3.4M, ~63%) comes from just three product categories: **Siding, Interior Trim, and Decking-Composite**.

The headline finding is that **the problem is not random**. It concentrates in:

- **One branch:** 25BW Millwork at 6.7% return (vs 3.8–5.1% at the other three branches).
- **Two product families:** Interior Trim (13.1%) and Siding (9.6%) — together $1.86M of credits.
- **A specific group of customers and SKUs** with chronic over-ordering — not damage, not warranty issues. Only 0.2% of credit memos mention damage or defect.

The dominant mechanism is **over-ordering by stick count** on standard-length mill products (16-foot LP, 12-foot Hardie). Roughly $1.50 of dollar adjustments leave the yard for every $1 of physical material returned, and the **average siding credit lands 8–30 days after the last delivery** — meaning we are not catching overages on the truck; we are making dedicated return trips weeks later.

Ten action items follow. Together they target an estimated **$200K–$300K of annual recoverable margin** plus an unquantified reduction in dedicated pickup trips, dock-handling labor, and damaged-on-return material.

---

## 2. The Numbers At A Glance

| Metric | TTM Value |
|---|---:|
| Shipped sales | $113.18M |
| Credit memos issued | 5,728 SOs / 35,201 lines |
| Total credits | $5.40M |
| **Blended return rate** | **4.77%** |
| Credits mentioning damage / defect | 9 SOs (0.2%) |
| Credits classified as physical "Return" | 1,145 SOs (20%) |
| Credits classified as adjustment "Credit" | 1,445 SOs (25%) |
| Credits with unspecified or category-only reference | 3,129 SOs (55%) |

---

## 3. Where Returns Concentrate

### 3.1 By Branch

| Branch | Sales $ | Credit $ | Return % |
|---|---:|---:|---:|
| 20GR Grimes | $70.05M | $3.18M | 4.54% |
| 40CV Coralville | $18.35M | $0.70M | 3.82% |
| **25BW Millwork** | **$15.42M** | **$1.04M** | **6.72%** |
| 10FD Fort Dodge | $9.29M | $0.48M | 5.14% |

The 25BW outlier is consistent with the category findings — Millwork's product mix is dominated by Interior Trim and specialty trim items, which are the two highest-return categories in the business.

### 3.2 By Product Major

| Category | Sales $ | Credit $ | Return % |
|---|---:|---:|---:|
| Exterior Finish Misc | $0.64M | $87K | 13.7% |
| **Interior Trim** | **$6.36M** | **$833K** | **13.1%** |
| Insulation-Drywall | $1.09M | $120K | 11.0% |
| **Siding** | **$10.67M** | **$1.02M** | **9.6%** |
| Roofing Materials | $1.14M | $88K | 7.7% |
| Nails-Screws-Anchors | $2.55M | $187K | 7.3% |
| Lumber | $16.25M | $949K | 5.8% |
| Decking-Composite | $9.90M | $576K | 5.8% |
| Panels | $7.69M | $293K | 3.8% |
| Building Materials Misc | $7.52M | $265K | 3.5% |
| Exterior Doors | $3.67M | $94K | 2.6% |
| Engineered Wood Products | $10.26M | $248K | 2.4% |
| Windows-Premium | $4.12M | $66K | 1.6% |
| Interior Doors | $4.67M | $68K | 1.5% |
| **Floor/Roof Trusses** | **$13.55M** | **$82K** | **0.6%** |
| **Windows-Vinyl** | **$9.65M** | **$50K** | **0.5%** |

Pre-engineered and pre-spec'd categories (trusses, windows) return at well under 1%. Cut-on-site and made-to-fit categories (trim, siding, soffit, drywall) return at 2-3x the company average.

### 3.3 By Customer — Top 10 by Credit Dollars

| Customer | Sales $ | Credit $ | Return % |
|---|---:|---:|---:|
| KRM Development | $8.77M | $401K | 4.6% |
| Sage Homes | $7.53M | $265K | 3.5% |
| Greenland Homes | $3.01M | $225K | 7.5% |
| Hubbell Homes (New PO) | $10.39M | $135K | 1.3% |
| Cash Sale Grimes | $2.50M | $131K | 5.2% |
| BLC Projects | $1.46M | $111K | 7.6% |
| Brenner Built | $2.30M | $110K | 4.8% |
| Claman Custom Homes | $1.53M | $101K | 6.6% |
| Accurate Development | $2.16M | $98K | 4.5% |
| Ground Breaker Homes | $1.54M | $94K | 6.1% |

### 3.4 Customers with the Highest Return Rate (over $250K in shipped sales)

| Customer | Sales $ | Credit $ | Return % |
|---|---:|---:|---:|
| Oakwood Builders Group | $391K | $53K | 13.6% |
| Rojohn Home Improvement | $293K | $33K | 11.1% |
| Henkel Construction | $329K | $37K | 11.1% |
| Ram Homes | $302K | $30K | 9.9% |
| Clarity Construction | $891K | $82K | 9.2% |
| Beitz, Ryan | $332K | $29K | 8.7% |
| Wicks Homes | $396K | $33K | 8.4% |
| MJ Properties | $611K | $49K | 8.0% |
| BLC Projects | $1.46M | $111K | 7.6% |

---

## 4. The Real Pattern — Stick-Count Over-ordering on Trim & Siding

Mill length is fixed (16-foot on LP, 12-foot on Hardie, 8-foot on Hardie soffit). The metric that matters is **sticks shipped vs sticks credited** and **how many distinct jobsites generated a credit**.

**Baseline:** On the two highest-volume lap siding SKUs:
- LP 16' lap (`lpsidtxt0816`): 7.3% qty return; 59% of jobsites credit some.
- Hardie 12' lap (`jhsidtxt081412`): 7.8% qty return; 60% of jobsites credit some.

So roughly **7% is the unavoidable "broke-a-bundle" floor**. Any SKU above 10–12% is genuine over-ordering, and a high jobsite-hit-rate (>50%) indicates it is systemic across the customer base rather than isolated.

### 4.1 Items Operating Well Above Baseline

| Item | Description | Sticks Shipped | Sticks Returned | Qty Return % | Jobsites Hit % | Credit $ |
|---|---|---:|---:|---:|---:|---:|
| clayjamb691617 | Pine FJ Jamb 6-9/16x17' | 3,460 | 1,195 | 34.5% | 74.1% | $40K |
| birchply4814mdf | 4x8-¼ Birch Ply MDF | 1,305 | 383 | 29.3% | 46.0% | $25K |
| 0108whiteoak | 1x8 RL S4S White Oak | 3,725 | 1,033 | 27.7% | 47.7% | $21K |
| rollexwht316 | Rollex SYS316 White Soffit | 1,486 | 373 | 25.1% | 48.4% | $14K |
| jhshakestaggered | Hardie Heritage Staggered | 7,294 | 1,725 | 23.6% | 63.6% | $17K |
| lpshake7161248st | LP Text Shake 12x48 | 10,455 | 2,413 | 23.1% | 56.9% | $25K |
| jhtrimtx4425 | Hardie Textured Batten 2½"-12' | 9,061 | 2,020 | 22.3% | 67.3% | $22K |
| popbase293mis00 | Poplar Mission Base 5¼" | 19,802 | 4,421 | 22.3% | 54.7% | $16K |
| popplypmdf4814 | 4x8-¼ Poplar Ply MDF | 1,333 | 283 | 21.2% | 38.6% | $19K |
| jhtrimtx5411 | 5/4x11¼-12' Hardie Trim | 2,069 | 355 | 17.2% | 45.3% | $17K |
| mdfbase512Ee1e | 512E MDF Base 5¼" | 27,557 | 4,507 | 16.4% | 63.1% | $41K |
| lptrimtxt010816 | 1x8-16' LP Strand Trim | 10,640 | 1,631 | 15.3% | 37.0% | $50K |
| 0108pop | 1x8 RL S4S Poplar | 57,010 | 8,229 | 14.4% | 42.2% | $34K |
| popplypwvc4834 | 4x8-¾ Poplar Ply Veneer | 2,639 | 373 | 14.1% | 37.4% | $42K |

**Counter-example proving this is fixable:** `jhtrimtx5405` (5/4x5.5"-12' Hardie Trim) ships 9,872 sticks across 249 jobsites at **only 6.3% qty return** — the most-commonly-specified Hardie trim width. As Hardie trim gets wider (5.5" → 7.25" → 11.25"), the return rate climbs from 6.3% to 13.2% to 17.2%, suggesting estimators are not adjusting per-stick consumption as width increases.

### 4.2 Customer-by-Category Matrix

How each major customer performs across Hardie, LP, and Interior Trim (filtered to >$75K shipped in that bucket):

| Customer | Hardie Return | LP Return | Interior Trim Return |
|---|---:|---:|---:|
| **Hubbell Construction Services** | **1.2%** ($640K) | — | — |
| **GCC Construction** | **0.0%** ($324K) | — | — |
| Hubbell Homes New PO | — | — | 8.4% ($389K) |
| Sage Homes | — | 6.7% ($1.08M) | 13.0% ($626K) |
| Clarity Construction | 8.2% ($438K) | — | **25.4%** ($101K) |
| **KRM Development** | 8.9% ($1.07M) | — | **17.9%** ($791K, **$142K credit**) |
| **Greenland Homes** | — | 13.5% ($212K) | **21.3%** ($481K, **$102K credit**) |
| Brenner Built | **14.9%** ($226K) | — | 16.6% ($143K) |
| Accurate Development | — | 14.1% ($200K) | 16.3% ($171K) |
| Cutler Construction | — | 15.4% ($95K) | — |
| Claman Custom Homes | 10.3% ($205K) | — | 13.9% ($208K) |
| Ground Breaker Homes | 10.3% ($193K) | — | 17.8% ($111K) |
| MJ Properties | 9.0% ($180K) | — | 20.3% ($92K) |
| Origin Homes | — | — | 18.9% ($109K) |
| **Des Moines Habitat** | — | **2.4%** ($132K) | — |
| **Mainbuilt LLC** | — | — | **1.3%** ($86K) |

**The standout finding:** Hubbell Construction Services runs Hardie at 1.2% on $640K of volume; GCC Construction runs Hardie at 0% on $324K. The rest of the field runs Hardie at 8-15%. This is not random — there is something structurally different in how those two takeoffs are built that the rest of the customer base could benefit from.

---

## 5. Reason Code Limitations

The credit memo `reference` field is free-text, not a structured reason code. Across 5,728 TTM credits:

- 1,445 (25%) labeled "[Category] Credit" — indicates an adjustment/allowance, material likely stayed on site.
- 1,145 (20%) labeled "[Category] Return" — indicates physical material came back.
- 1,196 (21%) labeled with only a category name ("Trim", "Siding") and no further reason.
- 1,003 (17%) labeled with unrelated text.
- 926 (16%) blank.
- **9 (0.2%) mention damage or defect.**

For Siding and Interior Trim specifically, **adjustments outweigh physical returns by 1.4–1.5x in dollars** — confirming that the dominant mechanism is over-ordering and post-job allowance, not material defects.

**Recommended fix:** add a 5-button reason picker to the credit memo workflow (Overage, Damage, Wrong Spec, Customer Change, Pricing Fix). Without it, future analyses will hit the same ceiling.

---

## 6. Timing — When Credits Land After the Last Delivery

| Category | Same Day | 1-7 Days | 8-30 Days | 31-90 Days | 90+ Days |
|---|---:|---:|---:|---:|---:|
| Siding | $6K | $72K | **$433K (53%)** | $254K (31%) | $30K |
| Interior Trim | $16K | $31K | $250K (34%) | **$361K (49%)** | $19K |
| Lumber | $37K | $93K | **$341K (40%)** | $258K (30%) | $36K |
| Decking | $43K | $101K | **$228K (44%)** | $83K | $12K |

**Same-day credits are negligible** — meaning we are not catching overages on the delivery truck and bringing material back same-trip. Instead, the dominant pattern is **dedicated return trips 1-12 weeks after the last shipment**. This represents real unbilled logistics cost: roughly 3,200 siding+trim credit-line trips per year, at a conservative $75/trip estimate, equals approximately **$240K in unbilled return-pickup expense annually** — on top of the material value of the credits themselves.

---

## 7. Action Items

### Product (5)

#### 1. Re-estimate Hardie Heritage Staggered shake (`jhshakestaggered`)
23.6% qty return on 63.6% of jobsites — the worst major Hardie SKU. The staggered pattern has lower per-piece coverage than lap, but the takeoff appears to use a lap-equivalent SF factor. Adjust the coverage rule in the estimating template; recalibrate against the last 10 staggered-pattern jobs' as-built quantities.
**Estimated recovery: ~$10K/yr.**

#### 2. Switch Pine FJ Jamb 6-9/16x17' (`clayjamb691617`) to per-door-opening counts
34.5% return on 74% of jobsites — highest of any major SKU. These are being ordered as bundle units rather than tied to the door schedule. New rule: 1 jamb per door rough opening + 5% waste allowance, period. No bundle defaults.
**Estimated recovery: ~$25K/yr.**

#### 3. Tighten the MDF Base 512E (`mdfbase512Ee1e`) default takeoff factor by 10%
The default 5¼" base on virtually every house — ships to 512 jobsites/yr, 63% of them generate a credit, 16.4% qty return. The estimating factor is too generous. A single 10% reduction in the template recovers most of the leak immediately and is easy to roll back if undershipping starts.
**Estimated recovery: ~$25K/yr.**

#### 4. Remove Hardie Textured Batten (`jhtrimtx4425`) from the default Hardie template
22.3% return on 67% of jobsites. Batten quantity depends entirely on architect-specified spacing (16" oc vs 24" oc vs accent-only). Require the estimator to confirm spacing before adding battens; do not carry a default count.
**Estimated recovery: ~$12K/yr.**

#### 5. Break-pack pricing for ¼" plywood (Birch & Poplar MDF core)
Three SKUs at 14-29% return rates. They ship in 8-sheet lifts, but only 2-4 sheets are typically used (back panels, drawer bottoms, accent walls). Stock a loose-sheet SKU with a $5-8 break-pack upcharge — better margin per sheet, no overage to haul back, less damaged-on-return material.
**Estimated recovery: ~$15K/yr plus freight saved.**

### Customer (5)

#### 6. Recalibrate the Interior Trim takeoff multiplier for Greenland Homes
$102K in trim credits on $481K shipped — the single biggest dollar leak in the company. Pull their last 10 trim packages, compare quoted vs as-built lineal feet on each major SKU, and drop the multiplier wherever it is running >12% over.
**Estimated recovery: ~$50K/yr.**

#### 7. Lead-carpenter takeoff walkthrough for KRM Development trim
$142K credit on $791K trim — second-biggest leak in the company. Their Hardie program is in line with the company average (8.9%), so the team knows how to run a job. The trim package is the issue. Invite KRM's lead trim carpenter to walk through the takeoff with our estimator on the next two jobs and adjust the per-house multiplier collaboratively. KRM is the #1 customer in the company by sales — this is a relationship investment with a clear financial payback.
**Estimated recovery: ~$60K/yr.**

#### 8. One-delivery policy on trim for Clarity Construction
25.4% trim return rate — highest of any builder with $100K+ in trim. Smaller customer ($891K total), so this is a process question, not a relationship investment: ship one trim delivery and require call-back for genuine shortfalls. If they object, requote trim as net-30 instead of with overage-credit.
**Estimated recovery: ~$15K/yr.**

#### 9. Steer Brenner Built off Hardie Heritage Staggered + Textured Batten
14.9% Hardie return on $226K — worst major-volume Hardie customer. Their high-return SKUs are the same two patterns called out in product action items #1 and #4. Have the sales rep present a finish/cost comparison on the next two jobs with standard Hardie lap (`jhsidtxt081412`, 7.8% baseline) as an alternative.
**Estimated recovery: ~$15K/yr.**

#### 10. Codify Hubbell Construction Services + GCC Construction as the Hardie gold standard
Hubbell runs Hardie at 1.2% on $640K. GCC ran $324K of Hardie with zero credits. The rest of the field is 8-15%. There is something concrete in how those two takeoffs are built — most likely SF-by-elevation rather than lineal-foot-of-wall, plus a tighter waste factor. Pull the SOs, document the method, and roll it into the new-estimator training. **This is the single highest-leverage change in the report.**
**Estimated recovery: $100K+/yr if even half the gap to the rest of the customer base closes.**

### Aggregate Recovery Estimate

| Item | Estimated annual recovery |
|---|---:|
| Product items #1–#5 | ~$87K |
| Customer items #6–#9 | ~$140K |
| Customer item #10 (Hardie gold standard rollout) | ~$100K+ |
| **Subtotal — material credits** | **~$325K+** |
| Reduced dedicated-pickup trips | ~$50–100K (logistics) |
| **Total estimated annual impact** | **~$375K–$425K** |

---

## 8. Watch List (Not Action Items — Track Through Q1)

- **Greenland LP at 13.5%** — same builder, same over-multiplier pattern as their trim issue. Likely resolves alongside action item #6.
- **Accurate Development** at 14.1% LP and 16.3% Trim — consistency across two unrelated categories suggests site-management rather than internal estimating. Better suited to a customer conversation than an internal fix.
- **MJ Properties Interior Trim at 20.3%** — small enough to defer, but escalate to action item #8's treatment if it climbs further.
- **All four "100% returned" multi-trip cases** (Happe Commercial Poplar Tread, Bush Construction SL6 Fascia, BNR Cedar T&G, Embarq Birch Plywood) — these are spec-change events, not process bugs. Trace each back to the estimator who quoted the original; coachable moments, not policy.

---

## 9. Methodology & Caveats

**Data source.** All figures from the `customer_scorecard_fact` table in Supabase, joined to `agility_so_header` for sales rep attribution. This table aggregates Agility ERP shipment-line data and tags credits via the `is_credit` boolean. Reporting period is exactly 365 days ending May 27, 2026.

**What's a credit.** Any line where `is_credit = true` — corresponds to an Agility SO with `sale_type = 'Credit'`. This includes both physical-return RMAs and billing-side adjustments.

**Customer naming.** Customer codes shown are Agility's `cust_code` (e.g. `KRM1000`). Customer names are taken from `customer_name` at the point of shipment.

**Exclusions.** Items `intdoor`, `extdoor`, `laborservice`, `DNI`, and all `ZZ*` project/bundle codes are excluded from SKU-level analysis because they are catch-all bill-of-material codes rather than individual physical products. They remain included in branch and category aggregates.

**Reason codes.** No structured reason-code field exists on credit memos. Inferences about "physical return vs adjustment" derive from text-matching on the `reference` field, which is free-text. Only 0.2% of credit memos explicitly mention damage or defect; the actual damage rate is likely higher but not measurable from current data.

**Estimated recoveries.** All recovery figures are directional, computed as approximately 40-60% of the current credit dollar leak per item or customer. Actual recovery depends on whether the proposed change is fully implemented and how customers respond.

**Ship-to caveat.** Some credits land at ship-to addresses that received no in-window shipment, typically because the original sale was just before the TTM window. These appear in the timing analysis as "credit before last ship" and represent ~5-8% of credit volume per category.

---

## 10. Recommended Follow-up

1. **Add a structured reason picker to the credit-memo workflow** (Overage, Damage, Wrong Spec, Customer Change, Pricing Fix). Highest single improvement available to future returns analysis.
2. **Rerun this report quarterly** to track the effect of the 10 action items. The same SQL produces an apples-to-apples comparison.
3. **Build a customer-level returns scorecard view** under `/scorecard/[customerId]` so reps can see their own customers' return patterns ahead of a quote.
4. **Pilot the Hubbell/GCC Hardie takeoff method** on three new customers in Q1 and measure return-rate delta against the customer's prior 12-month baseline.

---

*Questions or specific drill-downs: contact data team. The underlying queries are reproducible from the SQL in the analysis transcript.*

# House Estimator – Claude Code Build Prompt

Paste everything below into Claude Code to build the web application.

---

## PROMPT

You are building a residential construction material takeoff estimator web application to replace an existing Excel-based tool used by lumber yard estimators across three branches (Grimes, Fort Dodge, Coralville). The entire data layer is already extracted into JSON and CSV files in the `/data` directory of this repo. Do not hardcode any values — load everything from those files.

---

## TECH STACK

- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express (or Next.js API routes — your choice)
- **Data:** JSON/CSV flat files from `/data` directory (no database required for v1)
- **Export:** CSV download matching the format expected by Agility ERP

---

## REPO DATA FILES

All lookup tables are in `/data/`:

| File | Purpose |
|---|---|
| `multipliers.json` | All quantity calculation constants (stud rates, waste factors, siding pcs/100SF, etc.) |
| `hardware_matrix.json` | 11 finishes × 12 functions → SKU lookup |
| `hardware_type_lookup.json` | User-facing lock name → finish code mapping |
| `hardware_catalog.json` | Full hardware item catalog |
| `door_styles.json` | Door family → size key → HC/SC item codes |
| `railing_matrix.json` | Railing style × component → product code or lumber size |
| `engineered_lumber.json` | LVL/LSL size → item code prefix + length lookup |
| `trim_switches.json` | Base and case trim type list with IDs |
| `osb_sheeting.json` | OSB/sheathing type → SKU |
| `branches.json` | Branch list with branch-specific product overrides |
| `customer_overrides.json` | Customer-specific Tyvek and billing group overrides |
| `known_issues.json` | Data quality issues to handle defensively |

---

## APPLICATION STRUCTURE

Build the app with these major sections. All correspond 1:1 with sections in the original Excel `Inputs` sheet:

### 1. Job Setup
Fields:
- Branch (select: Grimes / Fort Dodge / Coralville)
- Estimator name (text)
- Customer name (text with autocomplete — load from a `customers.csv` you'll stub with 10 sample rows)
- Customer code (auto-populated from customer selection)
- Job name (text)

### 2. Material Selections (global job settings)
- Plate type: Treated / Timberstrand
- Wall size: 2x4 / 2x6
- Triple plate: Yes / No
- Tyvek/house wrap type: Standard 9ft / Standard 10ft / Zip Panels / N/A / Tape Only
- Roof sheeting size (select from `osb_sheeting.json`)

### 3. Basement Section
Inputs: exterior wall LF (2x4 and 2x6, 8ft/9ft/10ft), interior wall LF, beam LF, stair count, header sizes/counts, FHA ceiling height, stoop joist size

### 4. First Floor Deck & Walls
Inputs: deck SF, deck type (Edge T&G / Gold Edge / Advantech / Diamond), TJI size, exterior wall LF by height, interior wall LF, engineered header sizes/counts, garage wall LF

### 5. Second Floor Deck & Walls
Same structure as First Floor

### 6. Roof
Inputs: sheeting SF, post counts/sizes, header sizes, soffit overhang

### 7. Shingles
Inputs: SF, ridge LF, hip LF

### 8. Siding
Inputs:
- Lap siding: type (LP/Hardie/Vinyl), profile size, SF
- Shake: type, SF
- Soffit: type (LP/Hardie/Rollex), SF
- Porch soffit: type, SF
- Trim boards: type, LF counts
- Corners: type, count
- Splicers: Yes/No

### 9. Trim
Inputs:
- Base type (select from `trim_switches.json` base_types)
- Case type (select from `trim_switches.json` case_types)
- Door counts: single 6/8, single 8/0, double 3-0, double 4-0, double 5-0, bifold 4-0, 5-0, 3-0
- Window count with LF
- Handrail type (select from `trim_switches.json` handrail_types), LF

### 10. Door Hardware
- Lock/hardware type (select from `hardware_type_lookup.json` display_name list)
- Door function counts: keyed, passage, privacy, dummy, deadbolt, handleset, stop (hinged), stop (spring), finger pull, bifold knob, pocket lock, inside trim
- Resolve SKUs using `hardware_matrix.json` keyed by finish_code × function

### 11. Exterior Deck
Inputs:
- Joist size: 2x8 / 2x10 / 2x12
- Beam size: 2x8 / 2x10 / 2x12
- Decking type (Cedar / Treated / Trex / TimberTech / Azek / Deckorators)
- Decking lengths (available lengths vary by type — see `railing_matrix.json`)
- Railing style (Treated / Treated w/DekPro / Cedar / Cedar w/DekPro / Westbury-Black / Westbury-White)
- Railing LF
- Post count
- Stair count, landing: Yes/No

### 12. Windows & Doors (package)
- Window count
- Door count

### 13. Options (up to 7)
Each option: description (text) + price (positive = add, negative = deduct)

---

## QUANTITY CALCULATION ENGINE

Create a calculation module `src/calculations/engine.ts` that:

1. **Loads multipliers** from `multipliers.json` at startup
2. **Accepts** the full job inputs object
3. **Returns** an array of line items: `{ qty, uom, sku, description, group, is_dynamic_sku: boolean }`

### Key calculation patterns to implement:

```typescript
// Studs
studs = ROUNDUP((ext_walls_lf + int_walls_lf) * multipliers.framing.stud_multiplier * 1.2)

// Treated plate
treated_plate = ROUNDUP(total_plate_lf / 14 / 3)

// Timberstrand plate
ts_plate = ROUNDUP(total_plate_lf / 16)

// Rim board
rim = ROUNDUP(total_perimeter_lf * (1/16) * 1.05)

// OSB sheathing
osb_panels = ROUNDUP(sf / 32)

// Tyvek (9ft walls)
tyvek_rolls = ROUNDUP(wall_sf * (1/150/9))

// Siding LP 8"
lp_pieces = ROUNDUP((lap_sf / 100) * multipliers.siding.lp["8in"].pieces_per_100sf * 1.0)

// Hardware SKU resolution
sku = hardware_matrix[finish_code][function_name]
```

### Rounding rules:
- All framing lumber: `Math.ceil()` (round up to next whole piece)
- All sheet goods (OSB, decking): `Math.ceil()`
- Rolls/bags: `Math.ceil()`
- Never round down on construction materials

### Engineered lumber item code generation:
```typescript
function getLVLCode(size: string, length_ft: number): string {
  const entry = engineered_lumber.size_to_prefix.find(e => e.size === size)
  if (!entry) throw new Error(`Unknown LVL size: ${size}`)
  return entry.prefix + String(length_ft).padStart(2, '0')
}
```

---

## EXPORT FORMAT

The export button generates a CSV with these exact columns (matching Agility ERP import format):

```
Qty, UOM, ItemCode, Description, Group, JobName, Estimator, CustomerCode, ShipTo, Message, Tally
```

Rules:
- Only include rows where `Qty > 0`
- `Group` values: Basement, 1st Deck, 1st I-Joist, 1st Walls, 2nd Deck, 2nd I-Joist, 2nd Walls, Roof, Columns, Window Pkg, Roofing, Siding, Trim, Hardware, Ext Deck, Windows, Doors
- `Tally` = blank for most items; populated for dimensional lumber with a length specification

---

## COVER PAGE / BID SUMMARY

After export, show a bid summary view:
- Auto-populated: Customer name, Job name, Estimator, Date
- Manual price entry fields by group (populated after user gets pricing back from Agility)
- Tax calculation: each group price × 1.07
- Bid total: sum of all group subtotals
- Options section: up to 7 lines, each showing description + add/deduct amount
- Print-ready layout

---

## KNOWN DATA ISSUES TO HANDLE

Load `known_issues.json` and handle each defensively:

1. **Plymouth Passage** (`id: 5`): The passage SKU may be wrong — show a `⚠` warning badge next to any PlymouthBN passage line item on the estimate review screen
2. **Null inside_trim** (`id: 4`): If `hardware_matrix[finish][inside_trim]` is null, suppress that row entirely (do not export a blank SKU)
3. **Railing items 13-15** (`id: 6`): If any railing component resolves to null, show a warning on the estimate that those items need manual entry
4. Display names in `hardware_type_lookup.json` already have the typos corrected (Latitude, single space, Stratus) — use these normalized values; do not re-import from any Excel source without re-normalizing

---

## BRANCH LOGIC

Load `branches.json`. When branch = "fort_dodge", override the standard stud SKU with the premium SKU defined in that branch record. Apply similar branch overrides wherever branch_id differs from the default.

---

## UI REQUIREMENTS

- Clean, professional look appropriate for a lumber yard office environment
- Each major section (Basement, 1st Floor, etc.) should be a collapsible card — collapsed by default, expanded when user clicks
- Show a running line-item count and estimated product count as user fills in sections
- Input fields: numbers only where appropriate; dropdowns for all selections
- Validation: required fields highlighted before export is allowed
- Mobile-friendly is a nice-to-have but desktop-first is the priority
- Dark/light mode toggle

---

## WHAT NOT TO BUILD IN V1

- No database — flat file JSON is fine for v1
- No authentication
- No Agility API integration (CSV export is sufficient)
- No customer management (stub 10 customers)
- No multi-estimate dashboard (single estimate at a time)

---

## FOLDER STRUCTURE TO CREATE

```
/
├── data/                    ← all JSON/CSV files from this repo
├── src/
│   ├── components/
│   │   ├── sections/        ← one component per estimate section
│   │   ├── ui/              ← shared UI components
│   │   └── BidSummary.tsx
│   ├── calculations/
│   │   ├── engine.ts        ← main calculation engine
│   │   ├── framing.ts
│   │   ├── siding.ts
│   │   ├── hardware.ts
│   │   ├── doors.ts
│   │   └── deck.ts
│   ├── types/
│   │   └── estimate.ts      ← all TypeScript interfaces
│   ├── utils/
│   │   ├── export.ts        ← CSV export
│   │   └── lookup.ts        ← data file loaders
│   └── App.tsx
├── public/
└── package.json
```

---

## START HERE

1. Scaffold the project with Vite + React + TypeScript + Tailwind
2. Copy all `/data` JSON files into the project
3. Create `src/types/estimate.ts` with full TypeScript interfaces for all inputs and outputs
4. Build `src/utils/lookup.ts` to load and cache all data files
5. Build `src/calculations/engine.ts` with the full calculation engine
6. Build one section component at a time, starting with Job Setup → Material Selections → Basement
7. Wire up the export function last
8. Add the bid summary / cover page view

Ask me if you have questions about any specific calculation or data mapping before writing code for that section.

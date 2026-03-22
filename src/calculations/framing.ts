import { WallSection, BasementSection, FloorSection, LineItem, JobInputs, Multipliers } from '../types/estimate';

export function getLVLCode(size: string, length_ft: number, engineeredLumber: any): string {
    const entry = engineeredLumber?.size_to_prefix?.find((e: any) => e.size === size);
    if (!entry) return `HDR-${size.replace(/[^a-z0-9]/gi, '')}-${String(length_ft).padStart(2, '0')}`;
    return entry.prefix + String(length_ft).padStart(2, '0');
}

// ── Stair framing helper ──────────────────────────────────────────────────────
// Per stair run: 4× 2x12×20ft stringers + 5× 2x4×12 WW blocking
function stairItems(stairCount: number, group: string): LineItem[] {
    if (stairCount <= 0) return [];
    return [
        {
            qty: stairCount * 4,
            uom: 'EA',
            sku: '0212fir20',               // 2x12 × 20ft solid sawn
            description: `2x12 × 20ft Stair Stringer`,
            group,
            is_dynamic_sku: false,
            tally: `${stairCount * 4}/20ft`,
        },
        {
            qty: stairCount * 5,
            uom: 'EA',
            sku: '0204ww12',               // 2x4 × 12ft WW (weather-wood/treated blocking)
            description: `2x4 × 12ft WW Stair Blocking`,
            group,
            is_dynamic_sku: false,
            tally: `${stairCount * 5}/12ft`,
        },
    ];
}

// ── FHA post helper (basement beam support columns) ───────────────────────────
// postCount is user-entered; height SKU derived from FHA ceiling height
function fhaPostItems(postCount: number, fhaCeilingHeight: number): LineItem[] {
    if (postCount <= 0 || fhaCeilingHeight <= 0) return [];
    const heightFt = Math.ceil(fhaCeilingHeight);
    const sku      = `fhapost${String(heightFt).padStart(2, '0')}`;
    return [{
        qty: postCount,
        uom: 'EA',
        sku,
        description: `FHA Adjustable Post ${heightFt}ft — Basement`,
        group: 'Basement',
        is_dynamic_sku: false,
    }];
}

// ── Stoop helper ──────────────────────────────────────────────────────────────
// stoopSF drives: treated joists (user-selected size) + treated plywood panels
// Assumes 4ft-deep stoop, joists at 16" OC running the short direction
function stoopItems(stoopSF: number, joistSize: string, engineeredLumber: any): LineItem[] {
    if (stoopSF <= 0) return [];

    // Joist count: assume stoop is ~4ft deep; width = SF/4; 16" OC = 0.75 joist/LF
    const stoopWidth  = stoopSF / 4;
    const joistCount  = Math.ceil(stoopWidth * 0.75);
    const joistLength = 8; // 8ft treated joists cover the 4ft depth with overhang

    // Build joist SKU — treated versions of the framing lumber
    const sizeMap: Record<string, string> = { '2x8': 'treat0208x08', '2x10': 'treat0210x08', '2x12': 'treat0212x08' };
    const joistSku = sizeMap[joistSize] ?? `treat${joistSize.replace('x','0')}x08`;

    // Treated plywood: 3/4" pressure-treated ply panels
    const plyPanels = Math.ceil(stoopSF / 32);

    return [
        {
            qty: joistCount,
            uom: 'EA',
            sku: joistSku,
            description: `Treated ${joistSize} × 8ft Stoop Joist`,
            group: 'Basement',
            is_dynamic_sku: false,
            tally: `${joistCount}/8ft`,
        },
        {
            qty: plyPanels,
            uom: 'EA',
            sku: 'treatply34',
            description: 'Treated 3/4" Plywood — Stoop',
            group: 'Basement',
            is_dynamic_sku: false,
        },
    ];
}

// ── TJI / I-Joist helper ─────────────────────────────────────────────────────
function tjiItems(tjiCount: number, tjiSize: string, group: string): LineItem[] {
    if (tjiCount <= 0) return [];
    const safeName = tjiSize.replace(/[^a-z0-9]/gi, '');
    return [{
        qty: tjiCount,
        uom: 'EA',
        sku: `TJI-${safeName}`,
        description: `${tjiSize}" TJI / I-Joist`,
        group,
        is_dynamic_sku: false,
    }];
}

// ── Main framing export ───────────────────────────────────────────────────────
export function calculateFraming(
    name: string,
    section: WallSection,
    inputs: JobInputs,
    multipliers: Multipliers,
    engineeredLumber?: any,
    branches?: any[],
    customerOverrides?: any
): LineItem[] {
    const items: LineItem[] = [];
    const { plateType, wallSize, triplePlate } = inputs.materials;
    const isBasement  = name === 'Basement';
    const groupLabel  = isBasement ? 'Basement' : name.includes('1st') ? '1st Walls' : '2nd Walls';

    const studMultiplier = isBasement
        ? multipliers.framing.stud_multiplier_basement.value
        : multipliers.framing.stud_multiplier_main.value;

    const totalLF =
        section.ext2x4_8ft + section.ext2x4_9ft + section.ext2x4_10ft +
        section.ext2x6_8ft + section.ext2x6_9ft + section.ext2x6_10ft +
        section.intWallLF;

    if (totalLF <= 0) return items;

    // ── Branch stud SKU override ─────────────────────────────────────────────
    const branchData = branches?.find((b: any) => b.branch_id === inputs.setup.branch);
    const studSku    = branchData?.stud_sku ?? (wallSize === '2x4' ? '0204studfir08' : '0206studfir09');

    // ── Studs ────────────────────────────────────────────────────────────────
    const studQty = Math.ceil(totalLF * studMultiplier * multipliers.framing.twenty_percent_waste.value);
    if (studQty > 0) items.push({ qty: studQty, uom: 'EA', sku: studSku, description: `${wallSize} Studs — ${name}`, group: groupLabel, is_dynamic_sku: false });

    // ── Plates ───────────────────────────────────────────────────────────────
    if (plateType === 'Treated') {
        const qty = Math.ceil(totalLF / 14 / 3);
        if (qty > 0) items.push({ qty, uom: 'EA', sku: 'treatplate14', description: `Treated Plate — ${name}`, group: groupLabel, is_dynamic_sku: false });
    } else {
        const qty = Math.ceil(totalLF / 16);
        if (qty > 0) items.push({ qty, uom: 'EA', sku: 'tmbrstnd116', description: `Timberstrand Plate 16ft — ${name}`, group: groupLabel, is_dynamic_sku: false });
    }

    // ── Triple plate ─────────────────────────────────────────────────────────
    if (triplePlate) {
        const qty = Math.ceil(totalLF * multipliers.framing.triple_plate_factor.value / 16);
        if (qty > 0) items.push({ qty, uom: 'EA', sku: 'tmbrstnd116', description: `Triple Plate — ${name}`, group: groupLabel, is_dynamic_sku: false });
    }

    // ── Rim board (floor sections only) ──────────────────────────────────────
    if (!isBasement) {
        const perimLF = section.ext2x4_8ft + section.ext2x4_9ft + section.ext2x4_10ft +
                        section.ext2x6_8ft + section.ext2x6_9ft + section.ext2x6_10ft;
        if (perimLF > 0) {
            const qty = Math.ceil(perimLF * multipliers.framing.rim_multiplier.value);
            if (qty > 0) items.push({ qty, uom: 'EA', sku: 'rimboard', description: `Rim Board — ${name}`, group: groupLabel, is_dynamic_sku: false });
        }
    }

    // ── Sill seal (basement exterior perimeter) ───────────────────────────────
    if (isBasement) {
        const extPerimLF = section.ext2x4_8ft + section.ext2x4_9ft + section.ext2x4_10ft +
                           section.ext2x6_8ft + section.ext2x6_9ft + section.ext2x6_10ft;
        if (extPerimLF > 0) {
            const lfPerRoll = multipliers.moisture_barrier?.sill_seal_roll_lf?.value ?? 50;
            const qty = Math.ceil(extPerimLF / lfPerRoll);
            if (qty > 0) items.push({ qty, uom: 'RL', sku: 'sillseal50', description: 'Sill Seal — Basement', group: 'Basement', is_dynamic_sku: false });
        }
    }

    // ── Tyvek / house wrap (non-basement) ────────────────────────────────────
    if (!isBasement && inputs.materials.tyvekType !== 'N/A' && inputs.materials.tyvekType !== 'Tape Only') {
        const extWallSF =
            (section.ext2x4_8ft + section.ext2x6_8ft) * 8 +
            (section.ext2x4_9ft + section.ext2x6_9ft) * 9 +
            (section.ext2x4_10ft + section.ext2x6_10ft) * 10;

        if (extWallSF > 0) {
            const custOverride = customerOverrides?.tyvek_overrides?.find(
                (o: any) => o.customer_name === inputs.setup.customerName
            );

            if (inputs.materials.tyvekType === 'Standard 9ft') {
                const sku = custOverride?.tyvek_code ?? 'tyvek9ft150';
                const qty = Math.ceil(extWallSF * multipliers.moisture_barrier.tyvek_9ft.value);
                if (qty > 0) items.push({ qty, uom: 'RL', sku, description: `Tyvek 9ft House Wrap — ${name}`, group: groupLabel, is_dynamic_sku: false });
            } else if (inputs.materials.tyvekType === 'Standard 10ft') {
                let sku = 'tyvek10ft150';
                if (custOverride?.force_height === '9ft')   sku = custOverride.tyvek_code ?? sku;
                if (custOverride?.force_height === 'auto')  sku = custOverride.tyvek_code_10 ?? sku;
                const qty = Math.ceil(extWallSF * multipliers.moisture_barrier.tyvek_10ft.value);
                if (qty > 0) items.push({ qty, uom: 'RL', sku, description: `Tyvek 10ft House Wrap — ${name}`, group: groupLabel, is_dynamic_sku: false });
            } else if (inputs.materials.tyvekType === 'Zip Panels') {
                const qty = Math.ceil(extWallSF / 32);
                if (qty > 0) items.push({ qty, uom: 'EA', sku: 'zippanel48', description: `Zip System Panel — ${name}`, group: groupLabel, is_dynamic_sku: false });
            }
        }
    }

    // ── Engineered headers ────────────────────────────────────────────────────
    for (const h of section.headers ?? []) {
        if (h.count <= 0) continue;
        const length_ft = h.length_ft ?? 12;
        const sku = engineeredLumber ? getLVLCode(h.size, length_ft, engineeredLumber) : `HDR-${h.size}-${length_ft}`;
        items.push({
            qty: h.count, uom: 'EA', sku,
            description: `${h.size} × ${length_ft}ft Engineered Header — ${name}`,
            group: groupLabel, is_dynamic_sku: true,
            tally: `${h.count}/${length_ft}ft`,
        });
    }

    // ── Stair framing ─────────────────────────────────────────────────────────
    items.push(...stairItems(section.stairCount, groupLabel));

    // ── TJI / I-Joists (floor sections) ──────────────────────────────────────
    if (!isBasement) {
        const floorSection = section as FloorSection;
        items.push(...tjiItems(floorSection.tjiCount ?? 0, floorSection.tjiSize ?? '', groupLabel.replace('Walls', 'I-Joist')));
    }

    // ── Basement-only: FHA posts + stoop ─────────────────────────────────────
    if (isBasement) {
        const bsmt = section as BasementSection;
        items.push(...fhaPostItems(bsmt.fhaPostCount ?? 0, bsmt.fhaCeilingHeight));
        items.push(...stoopItems(bsmt.stoopSF ?? 0, bsmt.stoopJoistSize, engineeredLumber));
    }

    return items;
}

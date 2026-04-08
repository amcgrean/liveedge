import { WallSection, BasementSection, FloorSection, PartyWallSection, LineItem, JobInputs, Multipliers } from '../types/estimate';

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
function stoopItems(bsmt: BasementSection, engineeredLumber: any): LineItem[] {
    const { stoopSF, stoopJoistSize, stoopRimLF, stoopDowSF, stoopHangerCount } = bsmt;
    if (stoopSF <= 0) return [];

    const items: LineItem[] = [];

    // Joist count: assume stoop is ~4ft deep; width = SF/4; 16" OC = 0.75 joist/LF
    const stoopWidth  = stoopSF / 4;
    const joistCount  = Math.ceil(stoopWidth * 0.75);

    // Build joist SKU — treated versions of the framing lumber
    const sizeMap: Record<string, string> = { '2x8': 'treat0208x08', '2x10': 'treat0210x08', '2x12': 'treat0212x08', '2x14': 'treat0214x08', '2x16': 'treat0216x08' };
    const joistSku = sizeMap[stoopJoistSize] ?? `treat${stoopJoistSize.replace('x','0')}x08`;

    items.push({
        qty: joistCount,
        uom: 'EA',
        sku: joistSku,
        description: `Treated ${stoopJoistSize} × 8ft Stoop Joist`,
        group: 'Basement',
        is_dynamic_sku: false,
        tally: `${joistCount}/8ft`,
    });

    // Treated plywood: 3/4" pressure-treated ply panels
    items.push({
        qty: Math.ceil(stoopSF / 32),
        uom: 'EA',
        sku: 'treatply34',
        description: 'Treated 3/4" Plywood — Stoop',
        group: 'Basement',
        is_dynamic_sku: false,
    });

    // Stoop rim board (treated 2× boards at 16ft)
    if ((stoopRimLF ?? 0) > 0) {
        const rimSku = sizeMap[stoopJoistSize] ?? 'treat0210x16';
        items.push({
            qty: Math.ceil((stoopRimLF ?? 0) / 16),
            uom: 'EA',
            sku: rimSku.replace('x08', 'x16'),
            description: `Treated ${stoopJoistSize} × 16ft Stoop Rim`,
            group: 'Basement',
            is_dynamic_sku: false,
        });
    }

    // 2" Dow rigid insulation (4×8 sheets = 32 SF each)
    if ((stoopDowSF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((stoopDowSF ?? 0) / 32),
            uom: 'EA',
            sku: 'dow2x4x8',
            description: '2" Dow Rigid Insulation 4×8',
            group: 'Basement',
            is_dynamic_sku: false,
        });
    }

    // Joist hangers
    if ((stoopHangerCount ?? 0) > 0) {
        items.push({
            qty: stoopHangerCount ?? 0,
            uom: 'EA',
            sku: 'LUS28',
            description: 'Stoop Joist Hanger (LUS)',
            group: 'Basement',
            is_dynamic_sku: true,
        });
    }

    return items;
}

// ── TJI / I-Joist helper ─────────────────────────────────────────────────────
function tjiItems(tjiCount: number, tjiSize: string, group: string): LineItem[] {
    if (tjiCount <= 0) return [];
    const safeName = tjiSize.replace(/[^a-z0-9]/gi, '');
    return [{
        qty: tjiCount,
        uom: 'EA',
        sku: `TJI-${safeName}`,
        description: `${tjiSize} TJI / I-Joist`,
        group,
        is_dynamic_sku: false,
    }];
}

// ── Conventional joist helper ─────────────────────────────────────────────────
function conventionalJoistItems(joistCount: number, joistSize: string, group: string): LineItem[] {
    if (joistCount <= 0 || !joistSize) return [];
    // Build SKU: e.g. '2x10' 16ft → '021016'
    const safeName = joistSize.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return [{
        qty: joistCount,
        uom: 'EA',
        sku: `${safeName}16`,   // TODO: verify length/SKU against catalog
        description: `${joistSize} × 16ft Joist`,
        group,
        is_dynamic_sku: false,
        tally: `${joistCount}/16ft`,
    }];
}

// ── Facemount hanger helper ───────────────────────────────────────────────────
function facemountItems(qty: number, joistSize: string, group: string): LineItem[] {
    if (qty <= 0) return [];
    // IUS series for TJI, LUS series for conventional lumber
    const sku = `lus${joistSize.replace(/[^0-9]/g, '')}`;  // e.g. lus210 for 2x10
    return [{
        qty,
        uom: 'EA',
        sku,    // TODO: verify IUS vs LUS based on joist type
        description: `Facemount Hanger ${joistSize}`,
        group,
        is_dynamic_sku: false,
    }];
}

// ── Gypsum ceiling helper ─────────────────────────────────────────────────────
function gypsumCeilingItems(sf: number, group: string): LineItem[] {
    if (sf <= 0) return [];
    return [{
        qty: Math.ceil(sf / 32),
        uom: 'EA',
        sku: 'gypsum12',    // 1/2" drywall 4x8 panel
        description: `1/2" Gypsum Ceiling`,
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

    const garageWallLF = (section as Partial<{ garageWallLF: number }>).garageWallLF || 0;

    // All standard + extended heights (garage LF added to 8ft bucket)
    const extByHeight: Record<string, number> = {
        '8ft':  section.ext2x4_8ft  + section.ext2x6_8ft  + garageWallLF,
        '9ft':  section.ext2x4_9ft  + section.ext2x6_9ft,
        '10ft': section.ext2x4_10ft + section.ext2x6_10ft,
        '12ft': (section.ext2x4_12ft ?? 0) + (section.ext2x6_12ft ?? 0),
        '14ft': (section.ext2x4_14ft ?? 0) + (section.ext2x6_14ft ?? 0),
        '16ft': (section.ext2x4_16ft ?? 0) + (section.ext2x6_16ft ?? 0),
        '20ft': (section.ext2x4_20ft ?? 0) + (section.ext2x6_20ft ?? 0),
    };

    // LSL stud totals (lumped by height; separate SKU prefix)
    const lslByHeight: Record<string, number> = {
        '8ft':  (section.ext2x4_lsl_8ft  ?? 0) + (section.ext2x6_lsl_8ft  ?? 0),
        '9ft':  (section.ext2x4_lsl_9ft  ?? 0) + (section.ext2x6_lsl_9ft  ?? 0),
        '10ft': (section.ext2x4_lsl_10ft ?? 0) + (section.ext2x6_lsl_10ft ?? 0),
    };

    const extLF  = Object.values(extByHeight).reduce((s, v) => s + v, 0)
                 + Object.values(lslByHeight).reduce((s, v) => s + v, 0);
    const totalLF = extLF + section.intWallLF + (section.bearingWallLF ?? 0) + (section.finishWallLF ?? 0);

    if (totalLF <= 0) return items;

    const heightToCode: Record<string, string> = {
        '8ft': '08', '9ft': '09', '10ft': '10', '12ft': '12', '14ft': '14', '16ft': '16', '20ft': '20',
    };

    const defaultStudSkus: Record<string, Record<string, string>> = {
        '2x4': { '8ft': '0204studfir08', '9ft': '0204studfir09', '10ft': '0204studfir10', '12ft': '0204studfir12', '14ft': '0204studfir14', '16ft': '0204studfir16', '20ft': '0204studfir20' },
        '2x6': { '8ft': '0206studfir08', '9ft': '0206studfir09', '10ft': '0206studfir10', '12ft': '0206studfir12', '14ft': '0206studfir14', '16ft': '0206studfir16', '20ft': '0206studfir20' },
    };

    const lslStudSkus: Record<string, string> = {
        '8ft': `0${wallSize.replace('x','0')}lsl08`,
        '9ft': `0${wallSize.replace('x','0')}lsl09`,
        '10ft': `0${wallSize.replace('x','0')}lsl10`,
    };

    const branchData = branches?.find((b: any) => b.branch_id === inputs.setup.branch);
    const branchStudSku8ft = branchData?.stud_sku;

    // ── Standard studs (by height) ────────────────────────────────────────────
    Object.entries(extByHeight).forEach(([height, wallLF]) => {
        if (wallLF <= 0) return;

        const studQty = Math.ceil(wallLF * studMultiplier * multipliers.framing.twenty_percent_waste.value);
        if (studQty <= 0) return;

        let studSku = (defaultStudSkus[wallSize] ?? {})[height] ?? `0${wallSize.replace('x','0')}studfir${heightToCode[height] ?? '08'}`;
        if (height === '8ft' && branchStudSku8ft) {
            studSku = branchStudSku8ft;
        } else if (height !== '8ft' && branchStudSku8ft?.includes('studfir08')) {
            studSku = branchStudSku8ft.replace('08', heightToCode[height] ?? height.replace('ft',''));
        } else if (height !== '8ft' && branchStudSku8ft?.includes('studprem08')) {
            studSku = branchStudSku8ft.replace('08', heightToCode[height] ?? height.replace('ft',''));
        }

        items.push({
            qty: studQty,
            uom: 'EA',
            sku: studSku,
            description: `${wallSize} ${height} Studs - ${name}`,
            group: name,
            is_dynamic_sku: false
        });
    });

    // ── LSL studs (by height) ────────────────────────────────────────────────
    Object.entries(lslByHeight).forEach(([height, wallLF]) => {
        if (wallLF <= 0) return;
        const studQty = Math.ceil(wallLF * studMultiplier * multipliers.framing.twenty_percent_waste.value);
        if (studQty <= 0) return;
        const sku = lslStudSkus[height] ?? `0${wallSize.replace('x','0')}lsl08`;
        items.push({
            qty: studQty,
            uom: 'EA',
            sku,
            description: `${wallSize} LSL ${height} Studs - ${name}`,
            group: name,
            is_dynamic_sku: false
        });
    });

    // Interior studs (default to 9ft studs)
    if (section.intWallLF > 0) {
        const intStudQty = Math.ceil(section.intWallLF * studMultiplier * multipliers.framing.twenty_percent_waste.value);
        const intStudSku = wallSize === '2x4' ? '0204studfir09' : '0206studfir09';
        if (intStudQty > 0) {
            items.push({
                qty: intStudQty,
                uom: 'EA',
                sku: intStudSku,
                description: `${wallSize} Interior Studs - ${name}`,
                group: name,
                is_dynamic_sku: false
            });
        }
    }

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

    // ── Rim board (floor sections only — use rimLF if present, else derive) ──
    if (!isBasement) {
        const rimLF = (section.rimLF ?? 0) > 0
            ? section.rimLF
            : Object.values(extByHeight).reduce((s, v) => s + v, 0);
        if (rimLF > 0) {
            const qty = Math.ceil(rimLF * multipliers.framing.rim_multiplier.value);
            if (qty > 0) items.push({ qty, uom: 'EA', sku: 'rimboard', description: `Rim Board — ${name}`, group: groupLabel, is_dynamic_sku: false });
        }
    }

    // ── Sill seal (basement exterior perimeter) ───────────────────────────────
    if (isBasement) {
        const extPerimLF = Object.values(extByHeight).reduce((s, v) => s + v, 0);
        if (extPerimLF > 0) {
            const lfPerRoll = multipliers.moisture_barrier?.sill_seal_roll_lf?.value ?? 50;
            const qty = Math.ceil(extPerimLF / lfPerRoll);
            if (qty > 0) items.push({ qty, uom: 'RL', sku: 'sillseal50', description: 'Sill Seal — Basement', group: 'Basement', is_dynamic_sku: false });
        }
    }

    // ── Tyvek / house wrap (non-basement) ────────────────────────────────────
    // Sum all heights: ft * LF gives SF per height
    const HEIGHT_FT: Record<string, number> = { '8ft': 8, '9ft': 9, '10ft': 10, '12ft': 12, '14ft': 14, '16ft': 16, '20ft': 20 };
    if (!isBasement && inputs.materials.tyvekType !== 'N/A' && inputs.materials.tyvekType !== 'Tape Only') {
        const extWallSF = Object.entries(extByHeight).reduce((sum, [ht, lf]) => sum + lf * (HEIGHT_FT[ht] ?? 8), 0);

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

    // ── Floor joists (floor sections) ────────────────────────────────────────
    if (!isBasement) {
        const floorSection = section as FloorSection;
        const joistGroup = groupLabel.replace('Walls', 'Framing');
        if ((floorSection.tjiCount ?? 0) > 0) {
            items.push(...tjiItems(floorSection.tjiCount, floorSection.tjiSize ?? '', joistGroup));
        } else if ((floorSection.joistCount ?? 0) > 0) {
            items.push(...conventionalJoistItems(floorSection.joistCount, floorSection.joistSize ?? '', joistGroup));
        }
        items.push(...facemountItems(floorSection.facemountQty ?? 0, floorSection.tjiSize || floorSection.joistSize || '2x10', joistGroup));
        items.push(...gypsumCeilingItems(floorSection.gypsumSF ?? 0, joistGroup));
    }

    // ── Basement-only: FHA posts + stoop ─────────────────────────────────────
    if (isBasement) {
        const bsmt = section as BasementSection;
        items.push(...fhaPostItems(bsmt.fhaPostCount ?? 0, bsmt.fhaCeilingHeight));
        items.push(...stoopItems(bsmt, engineeredLumber));
    }

    return items;
}

// ── Party Wall ────────────────────────────────────────────────────────────────
// Party wall between units: studs (16" OC), double top/bottom plates, gypsum both sides
export function calculatePartyWall(
    section: PartyWallSection,
    multipliers: Multipliers
): LineItem[] {
    const items: LineItem[] = [];
    if (section.lf <= 0) return items;

    const lf     = section.lf;
    const height = section.height;
    const dim    = section.framingSize; // '2x4' | '2x6'

    // Studs at 16" OC + 10% waste
    const studCode = height <= 8  ? `0${dim.replace('x','0')}ww${String(height * 12).padStart(2,'0')}` :
                     height === 9  ? `0${dim.replace('x','0')}ww0${height}` :
                     `0${dim.replace('x','0')}ww${height}`;
    const studQty = Math.ceil((lf / (16 / 12)) * 1.10);
    items.push({ qty: studQty, uom: 'EA', sku: studCode, description: `${dim} × ${height}ft Party Wall Stud`, group: 'Party Wall', is_dynamic_sku: false });

    // Plates: bottom × 1 + top × 2 (double top plate), both faces
    const plateQty = Math.ceil(lf / 16) * 3; // 3 plates (1 bottom + 2 top)
    const plateSku = dim === '2x6' ? '020616' : '020416';
    items.push({ qty: plateQty, uom: 'EA', sku: plateSku, description: `${dim} × 16ft Party Wall Plate`, group: 'Party Wall', is_dynamic_sku: false });

    // Gypsum — both sides, multiple layers
    const gypsumSF = lf * height * 2 * section.gypsumLayers; // 2 sides
    const sheetQty = Math.ceil(gypsumSF / 32); // 4×8 sheet = 32 SF
    items.push({ qty: sheetQty, uom: 'EA', sku: 'gyp5812', description: `5/8" Type-X Gypsum (Party Wall)`, group: 'Party Wall', is_dynamic_sku: false });

    return items;
}

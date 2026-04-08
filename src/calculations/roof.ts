import { RoofSection, LineItem, JobInputs, Multipliers } from '../types/estimate';

export function calculateRoof(
    section: RoofSection,
    inputs: JobInputs,
    multipliers: Multipliers,
    osbSheeting: any
): LineItem[] {
    const items: LineItem[] = [];

    if (section.sheetingSF <= 0) return items;

    // Roof Sheeting (OSB)
    const sfPerPanel = osbSheeting?.sf_per_panel || 32;
    const osbQty = Math.ceil(section.sheetingSF / sfPerPanel);
    const roofSheetingType = osbSheeting?.roof_sheeting_types?.find(
        (t: any) => t.display === inputs.materials.roofSheetingSize
    );
    const osbSku = roofSheetingType?.sku || 'osb4843';

    items.push({
        qty: osbQty,
        uom: 'EA',
        sku: osbSku,
        description: `Roof Sheeting ${inputs.materials.roofSheetingSize}`,
        group: 'Roof',
        is_dynamic_sku: false
    });

    // Gable sheathing (OSB)
    if ((section.gableSF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((section.gableSF ?? 0) / sfPerPanel),
            uom: 'EA',
            sku: osbSku,
            description: `Gable Sheathing ${inputs.materials.roofSheetingSize}`,
            group: 'Roof',
            is_dynamic_sku: false
        });
    }

    // Posts
    if (section.postCount > 0) {
        items.push({
            qty: section.postCount,
            uom: 'EA',
            sku: `post${section.postSize.replace('x', '')}`,
            description: `${section.postSize} Post`,
            group: 'Roof',
            is_dynamic_sku: false
        });
    }

    // Headers
    if (section.headerCount > 0 && section.headerSize) {
        items.push({
            qty: section.headerCount,
            uom: 'EA',
            sku: `HDR-${section.headerSize}`,
            description: `${section.headerSize} Header - Roof`,
            group: 'Roof',
            is_dynamic_sku: true
        });
    }

    // Rake fascia (1×6 boards, 16ft pieces)
    if ((section.rakeLF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((section.rakeLF ?? 0) / 16),
            uom: 'EA',
            sku: 'rake-fascia-1x6',
            description: 'Rake Fascia 1×6×16',
            group: 'Roof',
            is_dynamic_sku: false
        });
    }

    // Sub-fascia / soffit backing (2×6 boards, 16ft pieces)
    if ((section.soffitLF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((section.soffitLF ?? 0) / 16),
            uom: 'EA',
            sku: 'subfascia-2x6',
            description: 'Sub-Fascia 2×6×16',
            group: 'Roof',
            is_dynamic_sku: false
        });
    }

    // Valley flashing — manual override takes precedence; auto-derive from valley count otherwise
    const valleyRolls = (section.valley_flash_rolls ?? 0) > 0
        ? (section.valley_flash_rolls ?? 0)
        : (section.valleyCount ?? 0);
    if (valleyRolls > 0) {
        items.push({
            qty: valleyRolls,
            uom: 'RL',
            sku: 'valleyflash',
            description: 'Valley Flash Roll',
            group: 'Roof',
            is_dynamic_sku: false
        });
    }

    return items;
}

export function calculateShingles(
    shingles: { sf: number; ridgeLF: number; hipLF: number; ridgecatLF: number; starterLF: number; roofVentCount: number; iceWaterLF: number },
    _inputs: JobInputs
): LineItem[] {
    const items: LineItem[] = [];

    if (shingles.sf <= 0) return items;

    // Shingles - 1 square = 100 SF, sold in bundles (3 bundles/square)
    const squares = Math.ceil(shingles.sf / 100);
    items.push({
        qty: squares,
        uom: 'SQ',
        sku: 'shingle-std',
        description: 'Architectural Shingles',
        group: 'Roofing',
        is_dynamic_sku: false
    });

    // Ridge Cap
    if (shingles.ridgeLF > 0) {
        const ridgeQty = Math.ceil(shingles.ridgeLF / 33); // ~33 LF per bundle
        items.push({
            qty: ridgeQty,
            uom: 'BDL',
            sku: 'ridge-cap',
            description: 'Ridge Cap Shingles',
            group: 'Roofing',
            is_dynamic_sku: false
        });
    }

    // Hip shingles (same as ridge cap)
    if (shingles.hipLF > 0) {
        const hipQty = Math.ceil(shingles.hipLF / 33);
        items.push({
            qty: hipQty,
            uom: 'BDL',
            sku: 'hip-cap',
            description: 'Hip Cap Shingles',
            group: 'Roofing',
            is_dynamic_sku: false
        });
    }

    // Ridgecat (ventilated ridge cap) — sold in LF rolls ~20ft each
    if ((shingles.ridgecatLF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((shingles.ridgecatLF ?? 0) / 20),
            uom: 'EA',
            sku: 'ridgecat',
            description: 'Ridgecat Ventilated Ridge Cap',
            group: 'Roofing',
            is_dynamic_sku: false
        });
    }

    // Starter strip — ~105 LF per roll
    if ((shingles.starterLF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((shingles.starterLF ?? 0) / 105),
            uom: 'RL',
            sku: 'starter-strip',
            description: 'Starter Strip',
            group: 'Roofing',
            is_dynamic_sku: false
        });
    }

    // Ice & water shield — sold in rolls (2sq / 200 SF each)
    if ((shingles.iceWaterLF ?? 0) > 0) {
        // assume 3ft wide roll → SF = LF × 3
        const iceWaterSF = (shingles.iceWaterLF ?? 0) * 3;
        items.push({
            qty: Math.ceil(iceWaterSF / 200),
            uom: 'RL',
            sku: 'ice-water-shield',
            description: 'Ice & Water Shield',
            group: 'Roofing',
            is_dynamic_sku: false
        });
    }

    // Roof vents
    if ((shingles.roofVentCount ?? 0) > 0) {
        items.push({
            qty: shingles.roofVentCount ?? 0,
            uom: 'EA',
            sku: 'roof-vent',
            description: 'Roof Vent',
            group: 'Roofing',
            is_dynamic_sku: false
        });
    }

    return items;
}

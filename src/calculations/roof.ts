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

    return items;
}

export function calculateShingles(
    shingles: { sf: number; ridgeLF: number; hipLF: number },
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

    return items;
}

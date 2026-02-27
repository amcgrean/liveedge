import { SidingSection, LineItem, JobInputs, Multipliers } from '../types/estimate';

export function calculateSiding(
    section: SidingSection,
    _inputs: JobInputs,
    multipliers: Multipliers
): LineItem[] {
    const items: LineItem[] = [];

    // Lap Siding
    if (section.lapSF > 0) {
        let pieces = 0;
        if (section.lapType === 'LP') {
            const rate = multipliers.siding.lp[section.lapProfileSize]?.pieces_per_100sf || 9.0;
            pieces = Math.ceil((section.lapSF / 100) * rate);
        } else if (section.lapType === 'Hardie') {
            const rate = multipliers.siding.hardie[section.lapProfileSize]?.pieces_per_100sf || 6.0;
            pieces = Math.ceil((section.lapSF / 100) * rate);
        } else if (section.lapType === 'Vinyl') {
            pieces = Math.ceil((section.lapSF / 100) * multipliers.siding.vinyl.default.pieces_per_100sf);
        }

        if (pieces > 0) {
            items.push({
                qty: pieces,
                uom: 'EA',
                sku: `LAP-${section.lapType}-${section.lapProfileSize}`,
                description: `${section.lapType} ${section.lapProfileSize} Lap Siding`,
                group: 'Siding',
                is_dynamic_sku: false
            });
        }
    }

    // Shake
    if (section.shakeSF > 0 && section.shakeType && section.shakeType !== 'N/A') {
        const shakeQty = Math.ceil(section.shakeSF / 100 * 6.5); // approximate
        items.push({
            qty: shakeQty,
            uom: 'EA',
            sku: `SHAKE-${section.shakeType.replace(/\s+/g, '-')}`,
            description: `${section.shakeType} Shake Siding`,
            group: 'Siding',
            is_dynamic_sku: false
        });
    }

    // Soffit
    if (section.soffitSF > 0) {
        const lf_per_piece = (multipliers.siding as any).soffit_lf_per_piece?.[section.soffitType.toLowerCase()] || 12;
        const pieces = Math.ceil(section.soffitSF / lf_per_piece);
        items.push({
            qty: pieces,
            uom: 'EA',
            sku: `SOFFIT-${section.soffitType.toUpperCase()}`,
            description: `${section.soffitType} Soffit Panels`,
            group: 'Siding',
            is_dynamic_sku: false
        });
    }

    // Porch Soffit
    if (section.porchSoffitSF > 0 && section.porchSoffitType && section.porchSoffitType !== 'N/A') {
        const pieces = Math.ceil(section.porchSoffitSF / 32);
        items.push({
            qty: pieces,
            uom: 'EA',
            sku: `SOFFIT-PORCH-${section.porchSoffitType.toUpperCase()}`,
            description: `${section.porchSoffitType} Porch Soffit`,
            group: 'Siding',
            is_dynamic_sku: false
        });
    }

    // Trim Boards
    if (section.trimBoardLF > 0 && section.trimBoardType && section.trimBoardType !== 'N/A') {
        items.push({
            qty: section.trimBoardLF,
            uom: 'LF',
            sku: `SIDING-TRIM-${section.trimBoardType.replace(/\s+/g, '-').toUpperCase()}`,
            description: `${section.trimBoardType} Trim Board`,
            group: 'Siding',
            is_dynamic_sku: false
        });
    }

    // Corners
    if (section.cornerCount > 0 && section.cornerType && section.cornerType !== 'N/A') {
        items.push({
            qty: section.cornerCount,
            uom: 'EA',
            sku: `CORNER-${section.cornerType.replace(/\s+/g, '-').toUpperCase()}`,
            description: `${section.cornerType} Corner`,
            group: 'Siding',
            is_dynamic_sku: false
        });
    }

    // Splicers
    if (section.splicers) {
        items.push({
            qty: 1,
            uom: 'LOT',
            sku: 'SIDING-SPLICER',
            description: 'Siding Splicers',
            group: 'Siding',
            is_dynamic_sku: false
        });
    }

    return items;
}

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

    // LP/Hardie trim profiles — each size as separate LF line items (16ft sticks)
    const trimProfiles: Array<{ field: keyof SidingSection; label: string; sku: string }> = [
        { field: 'trim1x2LF',    label: '1×2 Trim',    sku: 'TRIM-1X2' },
        { field: 'trim1x4LF',    label: '1×4 Trim',    sku: 'TRIM-1X4' },
        { field: 'trim1x6LF',    label: '1×6 Trim',    sku: 'TRIM-1X6' },
        { field: 'trim1x8LF',    label: '1×8 Trim',    sku: 'TRIM-1X8' },
        { field: 'trim1x12LF',   label: '1×12 Trim',   sku: 'TRIM-1X12' },
        { field: 'trim5_4x4LF',  label: '5/4×4 Trim',  sku: 'TRIM-5_4X4' },
        { field: 'trim5_4x6LF',  label: '5/4×6 Trim',  sku: 'TRIM-5_4X6' },
        { field: 'trim5_4x8LF',  label: '5/4×8 Trim',  sku: 'TRIM-5_4X8' },
        { field: 'trim5_4x12LF', label: '5/4×12 Trim', sku: 'TRIM-5_4X12' },
    ];
    for (const { field, label, sku } of trimProfiles) {
        const lf = (section[field] as number) ?? 0;
        if (lf > 0) {
            items.push({
                qty: Math.ceil(lf / 16),
                uom: 'EA',
                sku,
                description: `${label} 16ft`,
                group: 'Siding',
                is_dynamic_sku: true
            });
        }
    }

    // Vinyl accessories (LF inputs, sold per roll or per piece)
    if ((section.jChannelLF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((section.jChannelLF ?? 0) / 12),
            uom: 'EA',
            sku: 'VINYL-J-CHANNEL',
            description: 'J-Channel 12ft',
            group: 'Siding',
            is_dynamic_sku: false
        });
    }
    if ((section.undersillLF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((section.undersillLF ?? 0) / 12),
            uom: 'EA',
            sku: 'VINYL-UNDERSILL',
            description: 'Undersill Trim 12ft',
            group: 'Siding',
            is_dynamic_sku: false
        });
    }
    if ((section.metalStartLF ?? 0) > 0) {
        items.push({
            qty: Math.ceil((section.metalStartLF ?? 0) / 10),
            uom: 'EA',
            sku: 'VINYL-METAL-START',
            description: 'Metal Starter Strip 10ft',
            group: 'Siding',
            is_dynamic_sku: false
        });
    }

    return items;
}

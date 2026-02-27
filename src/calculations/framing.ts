import { WallSection, LineItem, JobInputs, Multipliers } from '../types/estimate';

export function getLVLCode(size: string, length_ft: number, engineeredLumber: any): string {
    const entry = engineeredLumber?.size_to_prefix?.find((e: any) => e.size === size);
    if (!entry) return `HDR-${size}-${length_ft}ft`;
    return entry.prefix + String(length_ft).padStart(2, '0');
}

export function calculateFraming(
    name: string,
    section: WallSection,
    inputs: JobInputs,
    multipliers: Multipliers,
    engineeredLumber?: any,
    branches?: any[]
): LineItem[] {
    const items: LineItem[] = [];
    const { plateType, wallSize, triplePlate } = inputs.materials;
    const isBasement = name === 'Basement';

    const studMultiplier = isBasement
        ? multipliers.framing.stud_multiplier_basement.value
        : multipliers.framing.stud_multiplier_main.value;

    const totalLF = section.ext2x4_8ft + section.ext2x4_9ft + section.ext2x4_10ft +
        section.ext2x6_8ft + section.ext2x6_9ft + section.ext2x6_10ft +
        section.intWallLF;

    if (totalLF <= 0) return items;

    // Branch override for stud SKU
    let studSku = wallSize === '2x4' ? '02048fir092' : '02068fir092';
    const branchData = branches?.find((b: any) => b.branch_id === inputs.setup.branch);
    if (branchData?.stud_sku_override) {
        studSku = branchData.stud_sku_override;
    }

    // Studs
    const studQty = Math.ceil(totalLF * studMultiplier * multipliers.framing.twenty_percent_waste.value);
    if (studQty > 0) {
        items.push({
            qty: studQty,
            uom: 'EA',
            sku: studSku,
            description: `${wallSize} Studs - ${name}`,
            group: name,
            is_dynamic_sku: false
        });
    }

    // Plates
    const totalPlateLF = totalLF;
    if (plateType === 'Treated') {
        const treatedQty = Math.ceil(totalPlateLF / 14 / 3);
        if (treatedQty > 0) {
            items.push({
                qty: treatedQty,
                uom: 'EA',
                sku: 'treatplate14',
                description: `Treated Plate 2x${wallSize === '2x4' ? '4' : '6'} 14ft - ${name}`,
                group: name,
                is_dynamic_sku: false
            });
        }
    } else {
        const tsQty = Math.ceil(totalPlateLF / 16);
        if (tsQty > 0) {
            items.push({
                qty: tsQty,
                uom: 'EA',
                sku: 'tmbrstnd116',
                description: `Timberstrand Plate 16ft - ${name}`,
                group: name,
                is_dynamic_sku: false
            });
        }
    }

    // Triple Plate
    if (triplePlate) {
        const tripleQty = Math.ceil(totalPlateLF * multipliers.framing.triple_plate_factor.value / 16);
        if (tripleQty > 0) {
            items.push({
                qty: tripleQty,
                uom: 'EA',
                sku: 'tmbrstnd116',
                description: `Triple Plate - ${name}`,
                group: name,
                is_dynamic_sku: false
            });
        }
    }

    // Rim Board (for floor sections only - non-basement)
    if (!isBasement) {
        const perimeterLF = section.ext2x4_8ft + section.ext2x4_9ft + section.ext2x4_10ft +
            section.ext2x6_8ft + section.ext2x6_9ft + section.ext2x6_10ft;
        if (perimeterLF > 0) {
            const rimQty = Math.ceil(perimeterLF * multipliers.framing.rim_multiplier.value);
            if (rimQty > 0) {
                items.push({
                    qty: rimQty,
                    uom: 'EA',
                    sku: 'rimboard',
                    description: `Rim Board - ${name}`,
                    group: name,
                    is_dynamic_sku: false
                });
            }
        }
    }

    // Engineered Headers
    if (section.headers && section.headers.length > 0) {
        for (const h of section.headers) {
            if (h.count <= 0) continue;
            // Default to 12ft LVL if engineeredLumber not available
            const sku = engineeredLumber ? getLVLCode(h.size, 12, engineeredLumber) : `HDR-${h.size}`;
            items.push({
                qty: h.count,
                uom: 'EA',
                sku,
                description: `${h.size} Engineered Header - ${name}`,
                group: name,
                is_dynamic_sku: true,
                tally: `${h.count}/${12}ft`
            });
        }
    }

    // Tyvek/Moisture Barrier (for non-basement exterior walls)
    if (!isBasement && inputs.materials.tyvekType !== 'N/A' && inputs.materials.tyvekType !== 'Tape Only') {
        const extWallSF = (section.ext2x4_8ft + section.ext2x6_8ft) * 8 +
            (section.ext2x4_9ft + section.ext2x6_9ft) * 9 +
            (section.ext2x4_10ft + section.ext2x6_10ft) * 10;

        if (extWallSF > 0) {
            if (inputs.materials.tyvekType === 'Standard 9ft') {
                const rolls = Math.ceil(extWallSF * multipliers.moisture_barrier.tyvek_9ft.value);
                if (rolls > 0) {
                    items.push({
                        qty: rolls,
                        uom: 'RL',
                        sku: 'tyvek9ft150',
                        description: `Tyvek 9ft House Wrap Roll - ${name}`,
                        group: name,
                        is_dynamic_sku: false
                    });
                }
            } else if (inputs.materials.tyvekType === 'Standard 10ft') {
                const rolls = Math.ceil(extWallSF * multipliers.moisture_barrier.tyvek_10ft.value);
                if (rolls > 0) {
                    items.push({
                        qty: rolls,
                        uom: 'RL',
                        sku: 'tyvek10ft150',
                        description: `Tyvek 10ft House Wrap Roll - ${name}`,
                        group: name,
                        is_dynamic_sku: false
                    });
                }
            } else if (inputs.materials.tyvekType === 'Zip Panels') {
                const panels = Math.ceil(extWallSF / 32);
                if (panels > 0) {
                    items.push({
                        qty: panels,
                        uom: 'EA',
                        sku: 'zippanel48',
                        description: `Zip System Panel - ${name}`,
                        group: name,
                        is_dynamic_sku: false
                    });
                }
            }
        }
    }

    return items;
}

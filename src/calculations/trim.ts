import { TrimSection, LineItem, JobInputs } from '../types/estimate';

export function calculateTrim(
    section: TrimSection,
    _inputs: JobInputs,
    trimSwitches: any
): LineItem[] {
    const items: LineItem[] = [];

    // Base trim — user enters total LF; convert to 8ft sticks with 10% waste
    if (section.baseType && section.baseLF > 0) {
        const baseEntry = trimSwitches?.base_types?.find((t: any) => t.switch_key === section.baseType);
        if (baseEntry) {
            const stickCount = Math.ceil((section.baseLF * 1.10) / 8);
            items.push({
                qty: stickCount,
                uom: 'EA',
                sku: section.baseType,
                description: `Base Trim: ${baseEntry.display} × 8ft`,
                group: 'Trim',
                is_dynamic_sku: false,
                tally: `${stickCount}/8ft`,
            });
        }
    }

    // Case trim
    if (section.caseType) {
        const caseEntry = trimSwitches?.case_types?.find((t: any) => t.switch_key === section.caseType);
        if (caseEntry) {
            // Single-hung/slab door case: 36 LF equivalent per door
            // Double/bifold/pocket: 42 LF equivalent per door
            const singleDoors = (section.doorCounts.single68 ?? 0) + (section.doorCounts.single80 ?? 0)
                              + (section.doorCounts.slab28 ?? 0) + (section.doorCounts.slab30 ?? 0)
                              + (section.doorCounts.barnDoor28 ?? 0) + (section.doorCounts.barnDoor30 ?? 0);
            const doubleDoors = (section.doorCounts.double30 ?? 0) + (section.doorCounts.double40 ?? 0) + (section.doorCounts.double50 ?? 0);
            const bifoldDoors = (section.doorCounts.bifold40 ?? 0) + (section.doorCounts.bifold50 ?? 0) + (section.doorCounts.bifold30 ?? 0);
            const pocketDoors = (section.doorCounts.pocket28 ?? 0) + (section.doorCounts.pocket30 ?? 0);
            const doorCaseLF  = (singleDoors * 36) + (doubleDoors * 42) + (bifoldDoors * 42) + (pocketDoors * 42);
            const windowCaseLF = section.windowLF || (section.windowCount * 12);
            const totalCaseLF  = doorCaseLF + windowCaseLF;

            if (totalCaseLF > 0) {
                items.push({
                    qty: totalCaseLF,
                    uom: 'LF',
                    sku: `CASE-${section.caseType}`,
                    description: `Case Trim: ${caseEntry.display}`,
                    group: 'Trim',
                    is_dynamic_sku: false
                });
            }
        }
    }

    // Barn door hardware kits
    const barnTotal28 = section.doorCounts.barnDoor28 ?? 0;
    const barnTotal30 = section.doorCounts.barnDoor30 ?? 0;
    if (barnTotal28 > 0) {
        items.push({ qty: barnTotal28, uom: 'EA', sku: 'barndoor-hdwr-28', description: 'Barn Door Hardware Kit 2\'8"', group: 'Trim', is_dynamic_sku: true });
    }
    if (barnTotal30 > 0) {
        items.push({ qty: barnTotal30, uom: 'EA', sku: 'barndoor-hdwr-30', description: 'Barn Door Hardware Kit 3\'0"', group: 'Trim', is_dynamic_sku: true });
    }

    // Pocket door frames
    const pocketTotal = (section.doorCounts.pocket28 ?? 0) + (section.doorCounts.pocket30 ?? 0);
    if (pocketTotal > 0) {
        items.push({
            qty: pocketTotal,
            uom: 'EA',
            sku: 'pocketframe',  // TODO: verify SKU — typically sold per unit
            description: 'Pocket Door Frame Kit',
            group: 'Trim',
            is_dynamic_sku: false
        });
    }

    // Crown moulding
    if (section.crownType && (section.crownLF ?? 0) > 0) {
        const crownEntry = trimSwitches?.crown_types?.find((t: any) => t.switch_key === section.crownType);
        const stickCount = Math.ceil((section.crownLF * 1.10) / 16);
        items.push({
            qty: stickCount,
            uom: 'EA',
            sku: `CROWN-${section.crownType}`,
            description: crownEntry ? `${crownEntry.display} Crown Moulding × 16ft` : `Crown Moulding × 16ft`,
            group: 'Trim',
            is_dynamic_sku: false,
            tally: `${stickCount}/16ft`,
        });
    }

    // Chair rail moulding
    if ((section.chairRailLF ?? 0) > 0) {
        const stickCount = Math.ceil((section.chairRailLF * 1.10) / 16);
        items.push({ qty: stickCount, uom: 'EA', sku: 'CHAIR-RAIL', description: `Chair Rail Moulding × 16ft`, group: 'Trim', is_dynamic_sku: true, tally: `${stickCount}/16ft` });
    }

    // Shoe moulding (alongside baseboard)
    if ((section.shoeLF ?? 0) > 0) {
        const stickCount = Math.ceil((section.shoeLF * 1.10) / 16);
        items.push({ qty: stickCount, uom: 'EA', sku: 'SHOE-MOULD', description: `Shoe Moulding × 16ft`, group: 'Trim', is_dynamic_sku: true, tally: `${stickCount}/16ft` });
    }

    // Basement base trim
    if (section.baseType && (section.baseLFBasement ?? 0) > 0) {
        const stickCount = Math.ceil((section.baseLFBasement * 1.10) / 8);
        items.push({ qty: stickCount, uom: 'EA', sku: section.baseType, description: `Base Trim (Basement): ${section.baseType} × 8ft`, group: 'Trim', is_dynamic_sku: false, tally: `${stickCount}/8ft` });
    }

    // Handrail
    if (section.handrailType && section.handrailLF > 0) {
        const hrEntry = trimSwitches?.handrail_types?.find((t: any) => t.switch_key === section.handrailType);
        items.push({
            qty: section.handrailLF,
            uom: 'LF',
            sku: `HR-${section.handrailType}`,
            description: hrEntry ? `${hrEntry.display} Handrail` : 'Handrail',
            group: 'Trim',
            is_dynamic_sku: false
        });
    }

    // Handrail brackets
    if ((section.handrailBracketCount ?? 0) > 0) {
        items.push({
            qty: section.handrailBracketCount,
            uom: 'EA',
            sku: 'hrwallbracket',
            description: 'Handrail Wall Bracket',
            group: 'Trim',
            is_dynamic_sku: false
        });
    }

    // Stair accessories
    if ((section.balusterCount ?? 0) > 0) {
        items.push({ qty: section.balusterCount ?? 0, uom: 'EA', sku: 'baluster', description: 'Baluster', group: 'Trim', is_dynamic_sku: true });
    }
    if ((section.newelCount ?? 0) > 0) {
        items.push({ qty: section.newelCount ?? 0, uom: 'EA', sku: 'newelpost', description: 'Newel Post', group: 'Trim', is_dynamic_sku: true });
    }
    if ((section.rosetteCount ?? 0) > 0) {
        items.push({ qty: section.rosetteCount ?? 0, uom: 'EA', sku: 'rosette', description: 'Wall Rosette', group: 'Trim', is_dynamic_sku: false });
    }
    if ((section.skirtBoardLF ?? 0) > 0) {
        // 1×12 stair skirt — 16ft boards
        items.push({ qty: Math.ceil((section.skirtBoardLF ?? 0) / 16), uom: 'EA', sku: 'skirtboard1x12', description: '1×12 Stair Skirt Board 16ft', group: 'Trim', is_dynamic_sku: false });
    }
    if ((section.falseTreadCount ?? 0) > 0) {
        items.push({ qty: section.falseTreadCount ?? 0, uom: 'EA', sku: 'falsetread', description: 'False Tread Cap', group: 'Trim', is_dynamic_sku: true });
    }
    if ((section.stairSetCount ?? 0) > 0) {
        items.push({ qty: section.stairSetCount ?? 0, uom: 'EA', sku: 'stairset', description: 'Pre-Built Stair Set', group: 'Trim', is_dynamic_sku: true });
    }

    return items;
}

import { TrimSection, LineItem, JobInputs } from '../types/estimate';

export function calculateTrim(
    section: TrimSection,
    _inputs: JobInputs,
    trimSwitches: any
): LineItem[] {
    const items: LineItem[] = [];

    // Base trim
    if (section.baseType) {
        const baseEntry = trimSwitches?.base_types?.find((t: any) => t.switch_key === section.baseType);
        if (baseEntry) {
            // Calculate base trim quantity - approximate: need LF info, use window + door counts as proxy
            // This is a placeholder - real calc would use room-by-room LF data
            items.push({
                qty: 1,
                uom: 'LOT',
                sku: `BASE-${section.baseType}`,
                description: `Base Trim: ${baseEntry.display}`,
                group: 'Trim',
                is_dynamic_sku: false
            });
        }
    }

    // Case trim
    if (section.caseType) {
        const caseEntry = trimSwitches?.case_types?.find((t: any) => t.switch_key === section.caseType);
        if (caseEntry) {
            // Single-hung/slab door case: 36 LF equivalent per door
            // Double/bifold: 42 LF equivalent per door
            const singleDoors = section.doorCounts.single68 + section.doorCounts.single80;
            const doubleDoors = section.doorCounts.double30 + section.doorCounts.double40 + section.doorCounts.double50;
            const bifoldDoors = section.doorCounts.bifold40 + section.doorCounts.bifold50 + section.doorCounts.bifold30;
            const doorCaseLF = (singleDoors * 36) + (doubleDoors * 42) + (bifoldDoors * 42);
            const windowCaseLF = section.windowLF || (section.windowCount * 12);
            const totalCaseLF = doorCaseLF + windowCaseLF;

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

    // Handrail
    if (section.handrailType && section.handrailLF > 0) {
        const hrEntry = trimSwitches?.handrail_types?.find((t: any) => t.switch_key === section.handrailType);
        items.push({
            qty: section.handrailLF,
            uom: 'LF',
            sku: `HR-${section.handrailType}`,
            description: hrEntry ? `${hrEntry.display} Handrail` : `Handrail`,
            group: 'Trim',
            is_dynamic_sku: false
        });
    }

    return items;
}

import { ExteriorDeckSection, LineItem, JobInputs } from '../types/estimate';

export function calculateDeck(
    section: ExteriorDeckSection,
    _inputs: JobInputs,
    railingMatrix: any
): LineItem[] {
    const items: LineItem[] = [];

    // Joists — placeholder, need SF for qty
    if (section.joistSize) {
        // We don't have deck SF in ExteriorDeckSection, so output a note item if any LF/count is set
        if (section.postCount > 0 || section.railingLF > 0 || section.stairCount > 0) {
            items.push({
                qty: 1,
                uom: 'LOT',
                sku: `DECK-STRUCT-${section.joistSize}`,
                description: `Ext Deck Structure - ${section.joistSize} Joists / ${section.beamSize} Beams`,
                group: 'Ext Deck',
                is_dynamic_sku: false
            });
        }
    }

    // Decking material — 5/4×6 boards at 12ft, 12% waste
    if (section.deckingType && section.deckSF > 0) {
        const boardPcs = Math.ceil((section.deckSF * 1.12) / ((5.5 / 12) * 12));
        items.push({
            qty: boardPcs,
            uom: 'EA',
            sku: `DECK-${section.deckingType.toUpperCase().replace(/\s+/g, '-')}`,
            description: `${section.deckingType} 5/4×6 Decking × 12ft`,
            group: 'Ext Deck',
            is_dynamic_sku: false,
            tally: `${boardPcs}/12ft`,
        });
    }

    // Posts
    if (section.postCount > 0) {
        items.push({
            qty: section.postCount,
            uom: 'EA',
            sku: `DECK-POST-${section.joistSize}`,
            description: `Deck Post (${section.joistSize})`,
            group: 'Ext Deck',
            is_dynamic_sku: false
        });
    }

    // Stairs
    if (section.stairCount > 0) {
        items.push({
            qty: section.stairCount,
            uom: 'EA',
            sku: 'DECK-STAIR-PKG',
            description: 'Deck Stair Package',
            group: 'Ext Deck',
            is_dynamic_sku: false
        });
    }

    // Landing
    if (section.landing) {
        items.push({
            qty: 1,
            uom: 'LOT',
            sku: 'DECK-LANDING',
            description: 'Deck Landing Package',
            group: 'Ext Deck',
            is_dynamic_sku: false
        });
    }

    // Railing — use railing_matrix to get component list
    if (section.railingLF > 0 && section.railingStyle) {
        const style = section.railingStyle;
        const components = railingMatrix?.components || [];
        let hasNullWarning = false;

        for (const comp of components) {
            const productCode = comp[style];
            const itemNum = comp.item;

            // Known issues: items 13-15 are null for all styles
            if (itemNum >= 13 && itemNum <= 15) {
                hasNullWarning = true;
                continue;
            }

            if (!productCode) continue;

            items.push({
                qty: 1,
                uom: 'LOT',
                sku: productCode,
                description: `Railing: ${comp.description} (${section.railingLF} LF)`,
                group: 'Ext Deck',
                is_dynamic_sku: false,
                warning: undefined
            });
        }

        if (hasNullWarning) {
            items.push({
                qty: 1,
                uom: 'LOT',
                sku: 'RAILING-MANUAL',
                description: '⚠ Railing items 13-15: Manual entry required - not yet assigned in data',
                group: 'Ext Deck',
                is_dynamic_sku: false,
                warning: 'Railing items 13-15 need manual entry'
            });
        }
    }

    return items;
}

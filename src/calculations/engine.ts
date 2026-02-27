import { JobInputs, LineItem, Multipliers } from '../types/estimate';
import { calculateFraming } from './framing';
import { calculateSiding } from './siding';
import { calculateHardware } from './hardware';
import { calculateRoof, calculateShingles } from './roof';
import { calculateTrim } from './trim';
import { calculateDeck } from './deck';

export function calculateEstimate(
    inputs: JobInputs,
    data: {
        multipliers: Multipliers;
        hardwareMatrix: any;
        hardwareLookup: any;
        engineeredLumber?: any;
        branches?: any[];
        trimSwitches?: any;
        railingMatrix?: any;
        osbSheeting?: any;
    }
): LineItem[] {
    let allItems: LineItem[] = [];

    const eng = data.engineeredLumber;
    const branches = data.branches;

    // Basement
    allItems = allItems.concat(
        calculateFraming('Basement', inputs.basement, inputs, data.multipliers, eng, branches)
    );

    // First Floor Deck
    if (inputs.firstFloor.deckSF > 0) {
        const deckPanels = Math.ceil(inputs.firstFloor.deckSF / 32);
        allItems.push({
            qty: deckPanels,
            uom: 'EA',
            sku: `DECK-${inputs.firstFloor.deckType.replace(/\s+/g, '-').toUpperCase()}`,
            description: `${inputs.firstFloor.deckType} Subfloor - 1st Floor`,
            group: '1st Deck',
            is_dynamic_sku: false
        });
    }

    // First Floor Walls
    allItems = allItems.concat(
        calculateFraming('1st Floor', inputs.firstFloor, inputs, data.multipliers, eng, branches)
    );

    // Second Floor Deck
    if (inputs.secondFloor.deckSF > 0) {
        const deckPanels = Math.ceil(inputs.secondFloor.deckSF / 32);
        allItems.push({
            qty: deckPanels,
            uom: 'EA',
            sku: `DECK-${inputs.secondFloor.deckType.replace(/\s+/g, '-').toUpperCase()}`,
            description: `${inputs.secondFloor.deckType} Subfloor - 2nd Floor`,
            group: '2nd Deck',
            is_dynamic_sku: false
        });
    }

    // Second Floor Walls
    allItems = allItems.concat(
        calculateFraming('2nd Floor', inputs.secondFloor, inputs, data.multipliers, eng, branches)
    );

    // Roof
    allItems = allItems.concat(
        calculateRoof(inputs.roof, inputs, data.multipliers, data.osbSheeting)
    );

    // Shingles
    allItems = allItems.concat(
        calculateShingles(inputs.shingles, inputs)
    );

    // Siding
    allItems = allItems.concat(
        calculateSiding(inputs.siding, inputs, data.multipliers)
    );

    // Trim
    allItems = allItems.concat(
        calculateTrim(inputs.trim, inputs, data.trimSwitches)
    );

    // Hardware
    allItems = allItems.concat(
        calculateHardware(inputs.hardware, inputs, data.hardwareMatrix, data.hardwareLookup)
    );

    // Exterior Deck
    allItems = allItems.concat(
        calculateDeck(inputs.exteriorDeck, inputs, data.railingMatrix)
    );

    // Windows & Doors package
    if (inputs.windowsDoors.windowCount > 0) {
        allItems.push({
            qty: inputs.windowsDoors.windowCount,
            uom: 'EA',
            sku: 'WINDOW-PKG',
            description: 'Window Package',
            group: 'Window Pkg',
            is_dynamic_sku: false
        });
    }
    if (inputs.windowsDoors.doorCount > 0) {
        allItems.push({
            qty: inputs.windowsDoors.doorCount,
            uom: 'EA',
            sku: 'DOOR-PKG',
            description: 'Door Package',
            group: 'Doors',
            is_dynamic_sku: false
        });
    }

    // Options — included in summary but not in materials export
    // (Options are handled separately in BidSummary)

    // Filter out zero quantities
    return allItems.filter(item => item.qty > 0);
}

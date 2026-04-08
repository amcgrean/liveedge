import { JobInputs, LineItem, Multipliers } from '../types/estimate';
import { calculateFraming, calculatePartyWall } from './framing';
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
        doorStyles?: any;
        customerOverrides?: any;
    }
): LineItem[] {
    let all: LineItem[] = [];
    const eng = data.engineeredLumber;
    const br  = data.branches;
    const co  = data.customerOverrides;

    // ── Basement ─────────────────────────────────────────────────────────────────
    all = all.concat(calculateFraming('Basement', inputs.basement, inputs, data.multipliers, eng, br, co));

    // ── 1st Floor deck panels ────────────────────────────────────────────────────
    if (inputs.firstFloor.deckSF > 0) {
        all.push({
            qty: Math.ceil(inputs.firstFloor.deckSF / 32),
            uom: 'EA',
            sku: `DECK-${inputs.firstFloor.deckType.replace(/\s+/g, '-').toUpperCase()}`,
            description: `${inputs.firstFloor.deckType} Subfloor — 1st Floor`,
            group: '1st Deck',
            is_dynamic_sku: false,
        });
    }

    // ── 1st Floor walls ──────────────────────────────────────────────────────────
    all = all.concat(calculateFraming('1st Floor', inputs.firstFloor, inputs, data.multipliers, eng, br, co));

    // ── 2nd Floor deck panels ────────────────────────────────────────────────────
    if (inputs.secondFloor.deckSF > 0) {
        all.push({
            qty: Math.ceil(inputs.secondFloor.deckSF / 32),
            uom: 'EA',
            sku: `DECK-${inputs.secondFloor.deckType.replace(/\s+/g, '-').toUpperCase()}`,
            description: `${inputs.secondFloor.deckType} Subfloor — 2nd Floor`,
            group: '2nd Deck',
            is_dynamic_sku: false,
        });
    }

    // ── 2nd Floor walls ──────────────────────────────────────────────────────────
    all = all.concat(calculateFraming('2nd Floor', inputs.secondFloor, inputs, data.multipliers, eng, br, co));

    // ── Roof sheeting + posts/headers ────────────────────────────────────────────
    all = all.concat(calculateRoof(inputs.roof, inputs, data.multipliers, data.osbSheeting));

    // ── Shingles ─────────────────────────────────────────────────────────────────
    all = all.concat(calculateShingles(inputs.shingles, inputs));

    // ── Siding ───────────────────────────────────────────────────────────────────
    all = all.concat(calculateSiding(inputs.siding, inputs, data.multipliers));

    // ── Trim ─────────────────────────────────────────────────────────────────────
    all = all.concat(calculateTrim(inputs.trim, inputs, data.trimSwitches));

    // ── Hardware ─────────────────────────────────────────────────────────────────
    all = all.concat(calculateHardware(inputs.hardware, inputs, data.hardwareMatrix, data.hardwareLookup));

    // ── Exterior deck + railing ───────────────────────────────────────────────────
    all = all.concat(calculateDeck(inputs.exteriorDeck, inputs, data.railingMatrix));

    // ── Party Wall ───────────────────────────────────────────────────────────────
    all = all.concat(calculatePartyWall(inputs.partyWall, data.multipliers));

    // ── Windows & Doors package ───────────────────────────────────────────────────
    if (inputs.windowsDoors.windowCount > 0) {
        all.push({ qty: inputs.windowsDoors.windowCount, uom: 'EA', sku: 'WINDOW-PKG', description: 'Window Package', group: 'Window Pkg', is_dynamic_sku: false });
    }

    // Door units — resolved from door_styles.json
    for (const door of inputs.windowsDoors.doors) {
        if (door.count <= 0) continue;
        const familyData = data.doorStyles?.[door.style];
        const sizeData   = familyData?.sizes?.[door.sizeKey];
        const sku        = sizeData?.[door.hcSc];
        if (!sku) continue;

        const hcLabel = door.hcSc === 'hc' ? 'HC' : 'SC';
        const sizeLabel = door.sizeKey.replace('.', ' ');
        all.push({
            qty: door.count,
            uom: 'EA',
            sku,
            description: `${door.style} ${sizeLabel} ${hcLabel} Door`,
            group: 'Doors',
            is_dynamic_sku: false,
        });
    }

    // Filter zero-qty items
    return all.filter(item => item.qty > 0);
}

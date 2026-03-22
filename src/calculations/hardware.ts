import { HardwareSection, LineItem, JobInputs, HardwareMatrix, HardwareLookup } from '../types/estimate';

// The hardware_matrix.json uses snake_case keys; our TS counts object uses camelCase.
const CAMEL_TO_SNAKE: Record<string, string> = {
    keyed:       'keyed',
    passage:     'passage',
    privacy:     'privacy',
    dummy:       'dummy',
    deadbolt:    'deadbolt',
    handleset:   'handleset',
    stopHinged:  'stop_hinged',
    stopSpring:  'stop_spring',
    fingerPull:  'finger_pull',
    bifoldKnob:  'bifold_knob',
    pocketLock:  'pocket_lock',
    insideTrim:  'inside_trim',
};

const FUNC_LABELS: Record<string, string> = {
    keyed:      'Keyed Entry',
    passage:    'Passage',
    privacy:    'Privacy',
    dummy:      'Dummy',
    deadbolt:   'Deadbolt',
    handleset:  'Handleset',
    stopHinged: 'Door Stop (Hinged)',
    stopSpring: 'Door Stop (Spring)',
    fingerPull: 'Finger Pull',
    bifoldKnob: 'Bifold Knob',
    pocketLock: 'Pocket Lock',
    insideTrim: 'Inside Trim',
};

export function calculateHardware(
    section: HardwareSection,
    _inputs: JobInputs,
    matrix: HardwareMatrix,
    lookups: HardwareLookup[]
): LineItem[] {
    const items: LineItem[] = [];

    const lookup = lookups.find(l => l.display_name === section.type);
    if (!lookup) return items;

    const finish = lookup.finish_code;
    const finishMatrix = matrix[finish];
    if (!finishMatrix) return items;

    const functionKeys = Object.keys(section.counts) as (keyof typeof section.counts)[];

    for (const camelKey of functionKeys) {
        const qty = section.counts[camelKey];
        if (qty <= 0) continue;

        const matrixKey = CAMEL_TO_SNAKE[camelKey] ?? camelKey;
        const sku = finishMatrix[matrixKey];

        // Known issue #4: null inside_trim for Corona/Seville/Solstice/Stratus BN — suppress row entirely
        if (sku === null || sku === undefined) continue;

        // Known issue #5: PlymouthBN passage SKU is a placeholder — show warning
        const warning = (finish === 'PlymouthBN' && camelKey === 'passage')
            ? '⚠ Plymouth (BN) passage SKU (schply619pass) is a placeholder — verify with branch manager before going live'
            : undefined;

        items.push({
            qty,
            uom: 'EA',
            sku,
            description: `${section.type} — ${FUNC_LABELS[camelKey] ?? camelKey}`,
            group: 'Hardware',
            is_dynamic_sku: false,
            warning,
        });
    }

    return items;
}

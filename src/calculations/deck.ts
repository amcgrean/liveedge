import { ExteriorDeckSection, LineItem, JobInputs } from '../types/estimate';

export function calculateDeck(
    section: ExteriorDeckSection,
    _inputs: JobInputs,
    railingMatrix: any
): LineItem[] {
    const items: LineItem[] = [];
    if (section.deckSF <= 0 && section.postCount <= 0 && section.railingLF <= 0) return items;

    const GROUP = 'Ext Deck';

    // ── Joists ────────────────────────────────────────────────────────────────
    // Deck width estimated as √(deckSF); span across that width at given OC spacing
    if (section.deckSF > 0 && section.joistSize) {
        const spacingFt = (section.joistSpacing ?? 16) / 12;
        const deckWidth = Math.sqrt(section.deckSF);
        const joistCount = Math.ceil(deckWidth / spacingFt) + 1;
        const joistLen   = Math.ceil(section.deckSF / deckWidth / 2) * 2; // round up to next even ft
        const jLen       = Math.min(Math.max(joistLen, 8), 20);           // clamp 8-20ft
        const sizeCode   = section.joistSize.replace('x', '0').replace(/[^0-9]/g, '');
        items.push({
            qty: joistCount,
            uom: 'EA',
            sku: `treat0${sizeCode}x${String(jLen).padStart(2,'0')}`,  // TODO: verify treated SKU format
            description: `Treated ${section.joistSize} × ${jLen}ft Deck Joist`,
            group: GROUP,
            is_dynamic_sku: false,
            tally: `${joistCount}/${jLen}ft`,
        });
    }

    // ── Beams ─────────────────────────────────────────────────────────────────
    // Number of beams = postCount / 2 (each beam spans between two posts)
    if (section.beamSize && section.postCount > 0 && (section.beamSpan ?? 0) > 0) {
        const beamCount  = Math.max(1, Math.ceil(section.postCount / 2));
        const beamLen    = Math.ceil(section.beamSpan ?? 0);
        const bLenRnd    = Math.min(Math.max(beamLen, 8), 20);
        const bSizeCode  = section.beamSize.replace('x', '0').replace(/[^0-9]/g, '');
        items.push({
            qty: beamCount * 2,   // doubled beam = 2 boards
            uom: 'EA',
            sku: `treat0${bSizeCode}x${String(bLenRnd).padStart(2,'0')}`,  // TODO: verify treated SKU format
            description: `Treated ${section.beamSize} × ${bLenRnd}ft Deck Beam (doubled)`,
            group: GROUP,
            is_dynamic_sku: false,
            tally: `${beamCount * 2}/${bLenRnd}ft`,
        });
    }

    // ── Posts ─────────────────────────────────────────────────────────────────
    if (section.postCount > 0) {
        const postH = section.postHeight ?? 8;
        const postLenRnd = Math.min(Math.max(Math.ceil(postH + 1), 8), 16); // add 1ft for footing, clamp
        items.push({
            qty: section.postCount,
            uom: 'EA',
            sku: `treat4x4x${String(postLenRnd).padStart(2,'0')}`,  // TODO: verify 4x4 vs 6x6 based on height
            description: `Treated 4x4 × ${postLenRnd}ft Deck Post`,
            group: GROUP,
            is_dynamic_sku: false,
            tally: `${section.postCount}/${postLenRnd}ft`,
        });
        // Post bases (ABA44 adjustable standoff)
        items.push({
            qty: section.postCount,
            uom: 'EA',
            sku: 'aba44z',  // TODO: verify SKU
            description: 'ABA44Z Post Base',
            group: GROUP,
            is_dynamic_sku: false,
        });
    }

    // ── Ledger board (house attachment) ──────────────────────────────────────
    if ((section.ledgerLF ?? 0) > 0) {
        const ledgerLF   = section.ledgerLF ?? 0;
        const ledgerPcs  = Math.ceil(ledgerLF / 16);
        const lSizeCode  = (section.joistSize ?? '2x10').replace('x', '0').replace(/[^0-9]/g, '');
        items.push({
            qty: ledgerPcs,
            uom: 'EA',
            sku: `treat0${lSizeCode}x16`,
            description: `Treated ${section.joistSize ?? '2x10'} × 16ft Ledger`,
            group: GROUP,
            is_dynamic_sku: false,
            tally: `${ledgerPcs}/16ft`,
        });
        // LedgerLOK screws: ~20 per 16ft ledger board
        items.push({
            qty: ledgerPcs * 20,
            uom: 'EA',
            sku: 'ledgerlok',  // TODO: verify sold per-box or per-screw in catalog
            description: 'LedgerLOK Structural Screw',
            group: GROUP,
            is_dynamic_sku: false,
        });
    }

    // ── Glulam / LVL beam ────────────────────────────────────────────────────
    if ((section.glulamBeamLF ?? 0) > 0) {
        items.push({
            qty: section.glulamBeamLF,
            uom: 'LF',
            sku: 'DECK-GLULAM',
            description: 'Deck Glulam/LVL Beam',
            group: GROUP,
            is_dynamic_sku: true,
        });
    }

    // ── Hurricane ties ────────────────────────────────────────────────────────
    if ((section.hurricaneTieCount ?? 0) > 0) {
        items.push({
            qty: section.hurricaneTieCount,
            uom: 'EA',
            sku: 'h25az',
            description: 'H2.5AZ Hurricane Tie',
            group: GROUP,
            is_dynamic_sku: false,
        });
    }

    // ── Facemount hangers ─────────────────────────────────────────────────────
    if ((section.facemountQty ?? 0) > 0) {
        const jSize  = section.joistSize ?? '2x10';
        const sCode  = jSize.replace(/[^0-9]/g, '');
        items.push({
            qty: section.facemountQty,
            uom: 'EA',
            sku: `lus${sCode}`,  // LUS series facemount hanger; TODO: verify IUS for TJI
            description: `LUS Facemount Hanger ${jSize}`,
            group: GROUP,
            is_dynamic_sku: false,
        });
    }

    // ── Decking surface boards ────────────────────────────────────────────────
    if (section.deckingType && section.deckSF > 0) {
        // 5/4×6 nominal = 5.5" wide face; 12% waste factor
        const boardPcs = Math.ceil((section.deckSF * 1.12) / ((5.5 / 12) * 12));
        items.push({
            qty: boardPcs,
            uom: 'EA',
            sku: `DECK-${section.deckingType.toUpperCase().replace(/\s+/g, '-')}`,
            description: `${section.deckingType} 5/4×6 Decking × 12ft`,
            group: GROUP,
            is_dynamic_sku: false,
            tally: `${boardPcs}/12ft`,
        });
    }

    // ── Stairs ────────────────────────────────────────────────────────────────
    if (section.stairCount > 0) {
        // 3 treated 2x12×16ft stringers per stair run + 1 treated 2x10×10ft landing header
        items.push({
            qty: section.stairCount * 3,
            uom: 'EA',
            sku: 'treat021216',
            description: 'Treated 2x12 × 16ft Stair Stringer',
            group: GROUP,
            is_dynamic_sku: false,
            tally: `${section.stairCount * 3}/16ft`,
        });
    }

    // ── Landing ───────────────────────────────────────────────────────────────
    if (section.landing) {
        items.push({
            qty: 1,
            uom: 'LOT',
            sku: 'DECK-LANDING',
            description: 'Deck Landing Package',
            group: GROUP,
            is_dynamic_sku: false
        });
    }

    // ── Railing ───────────────────────────────────────────────────────────────
    if (section.railingLF > 0 && section.railingStyle) {
        const style = section.railingStyle;
        const components = railingMatrix?.components || [];
        let hasNullWarning = false;

        for (const comp of components) {
            const productCode = comp[style];
            const itemNum = comp.item;

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
                group: GROUP,
                is_dynamic_sku: false,
                warning: undefined
            });
        }

        if (hasNullWarning) {
            items.push({
                qty: 1,
                uom: 'LOT',
                sku: 'RAILING-MANUAL',
                description: '⚠ Railing items 13-15: Manual entry required',
                group: GROUP,
                is_dynamic_sku: false,
                warning: 'Railing items 13-15 need manual entry'
            });
        }
    }

    return items;
}

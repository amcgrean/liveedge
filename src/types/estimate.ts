export interface JobSetup {
    branch: 'grimes' | 'fort_dodge' | 'coralville';
    estimatorName: string;
    customerName: string;
    customerCode: string;
    jobName: string;
}

export interface MaterialSelections {
    plateType: 'Treated' | 'Timberstrand';
    wallSize: '2x4' | '2x6';
    triplePlate: boolean;
    tyvekType: 'Standard 9ft' | 'Standard 10ft' | 'Zip Panels' | 'N/A' | 'Tape Only';
    roofSheetingSize: string;
}

export interface HeaderEntry {
    size: string;       // e.g. '1.75x9.5', '2x10'
    length_ft: number;  // used to build LVL item code
    count: number;
}

export interface WallSection {
    // Standard framing stud heights
    ext2x4_8ft: number;
    ext2x4_9ft: number;
    ext2x4_10ft: number;
    ext2x4_12ft: number;
    ext2x4_14ft: number;
    ext2x4_16ft: number;
    ext2x4_20ft: number;
    ext2x6_8ft: number;
    ext2x6_9ft: number;
    ext2x6_10ft: number;
    ext2x6_12ft: number;
    ext2x6_14ft: number;
    ext2x6_16ft: number;
    ext2x6_20ft: number;
    // LSL stud variants (Timberstrand)
    ext2x4_lsl_8ft: number;
    ext2x4_lsl_9ft: number;
    ext2x4_lsl_10ft: number;
    ext2x6_lsl_8ft: number;
    ext2x6_lsl_9ft: number;
    ext2x6_lsl_10ft: number;
    intWallLF: number;
    bearingWallLF: number;
    finishWallLF: number;
    rimLF: number;
    beamLF: number;        // generic fallback if per-size not specified
    beam2x8LF: number;
    beam2x10LF: number;
    beam2x12LF: number;
    beamLVLLF: number;     // LVL/glulam beam LF
    beamSteelLF: number;   // steel beam LF
    stairCount: number;
    pocketFrameCount: number;  // pocket door rough openings — drives pocket frame kit SKU
    headers: HeaderEntry[];
}

export interface BasementSection extends WallSection {
    fhaCeilingHeight: number;  // ft — drives FHA post height/SKU
    fhaPostCount: number;      // user-entered count of FHA adjustable posts
    stoopJoistSize: string;    // '2x8' | '2x10' | '2x12' | '2x14' | '2x16'
    stoopSF: number;           // stoop square footage → joist qty + treated plywood
    stoopRimLF: number;        // rim board LF around stoop perimeter
    stoopDowSF: number;        // 2" Dow rigid insulation under stoop (SF)
    stoopHangerCount: number;  // joist hanger count for stoop framing
}

export interface FloorSection extends WallSection {
    deckSF: number;
    deckType: 'Edge T&G' | 'Gold Edge' | 'Advantech' | 'Diamond';
    tjiSize: string;
    tjiCount: number;       // user-entered count of I-joists (0 = use conventional joist)
    joistSize: string;      // conventional joist size e.g. '2x10' — used when tjiCount=0
    joistCount: number;     // user-entered count of conventional joists
    facemountQty: number;   // IUS/LUS facemount hangers
    gypsumSF: number;       // gypsum ceiling SF for this floor level
    garageWallLF: number;
}

export interface RoofSection {
    sheetingSF: number;
    postCount: number;
    postSize: string;
    headerSize: string;
    headerCount: number;
    soffitOverhang: number;   // inches
    // Additional roof geometry
    valleyCount: number;       // # of valleys (drives valley flash roll qty)
    rakeLF: number;            // rake edge LF (drives rake fascia boards)
    soffitLF: number;          // total soffit perimeter LF (drives sub-fascia)
    gableSF: number;           // gable end SF (for OSB gable sheathing)
    valley_flash_rolls: number; // manual override — 0 = auto-derive from valleyCount
    hucqCount: number;          // HUCQ hurricane tie qty (rafter/hip connections)
    vycorLF: number;            // Vycor peel-and-stick flashing LF
    roofGypsumSF: number;       // gypsum SF on underside of roof (fire rating)
}

export interface SidingSection {
    lapType: 'LP' | 'Hardie' | 'Vinyl';
    lapProfileSize: string;
    lapSF: number;
    shakeType: string;
    shakeSF: number;
    soffitType: 'LP' | 'Hardie' | 'Rollex';
    soffitSF: number;
    porchSoffitType: string;
    porchSoffitSF: number;
    trimBoardType: string;
    trimBoardLF: number;
    cornerType: string;
    cornerCount: number;
    splicers: boolean;
    // LP/Hardie trim profiles (LF each) — separate from trimBoardType/trimBoardLF generic
    trim1x2LF: number;
    trim1x4LF: number;
    trim1x6LF: number;
    trim1x8LF: number;
    trim1x12LF: number;
    trim5_4x4LF: number;
    trim5_4x6LF: number;
    trim5_4x8LF: number;
    trim5_4x12LF: number;
    // Vinyl siding accessories
    jChannelLF: number;
    undersillLF: number;
    metalStartLF: number;
}

export interface TrimSection {
    baseType: string;
    baseLF: number;         // user-entered total LF of base trim
    caseType: string;
    doorCounts: {
        single68: number;
        single80: number;
        double30: number;
        double40: number;
        double50: number;
        bifold40: number;
        bifold50: number;
        bifold30: number;
        slab28: number;
        slab30: number;
        pocket28: number;
        pocket30: number;
        barnDoor28: number;
        barnDoor30: number;
    };
    windowCount: number;
    windowLF: number;
    handrailType: string;
    handrailLF: number;
    handrailBracketCount: number;   // post-to-wall bracket qty
    crownType: string;
    crownLF: number;
    chairRailLF: number;     // chair rail moulding LF (dynamic SKU — style varies)
    shoeLF: number;          // shoe moulding LF (usually same as base type)
    baseLFBasement: number;  // base trim LF for basement (separate run)
    // Stair accessories
    balusterCount: number;          // individual spindles (wood or metal)
    newelCount: number;             // newel posts (landing/floor-mount)
    rosetteCount: number;           // wall rosettes at top/bottom of run
    skirtBoardLF: number;           // stair skirt board (1×12) LF
    falseTreadCount: number;        // false tread caps over existing stairs
    stairSetCount: number;          // full stair sets (pre-built box stairs)
}

export interface HardwareSection {
    type: string;
    counts: {
        keyed: number;
        passage: number;
        privacy: number;
        dummy: number;
        deadbolt: number;
        handleset: number;
        stopHinged: number;
        stopSpring: number;
        fingerPull: number;
        bifoldKnob: number;
        pocketLock: number;
        insideTrim: number;
    };
}

export interface ExteriorDeckSection {
    deckSF: number;           // deck square footage → drives decking board quantity
    joistSize: '2x8' | '2x10' | '2x12';
    joistSpacing: 12 | 16 | 24;   // OC spacing in inches
    beamSize: '2x8' | '2x10' | '2x12';
    beamSpan: number;         // ft between posts/beam supports
    glulamBeamLF: number;     // glulam/LVL beam LF (dynamic SKU)
    hurricaneTieCount: number; // H2.5A or similar tie qty
    deckingType: string;
    deckingLengths: number[];
    railingStyle: string;
    railingLF: number;
    postCount: number;
    postHeight: number;       // ft — drives post length SKU
    ledgerLF: number;         // LF of ledger board (house attachment)
    facemountQty: number;     // joist hanger qty (IUS/LUS)
    stairCount: number;
    landing: boolean;
}

export interface PartyWallSection {
    lf: number;           // total party wall LF
    height: number;       // wall height in ft
    gypsumLayers: number; // layers of gypsum per side (typically 1–2)
    framingSize: '2x4' | '2x6';
}

// Door entry for Windows & Doors section — resolves to door_styles.json SKU
export interface DoorEntry {
    style: string;      // 'Madison' | 'Cambridge' | 'Continental' | 'Craftsman'
    sizeKey: string;    // e.g. 'slab.28', 'bi.40', 'dh.50', 'sh.30'
    hcSc: 'hc' | 'sc'; // hollow core vs solid core
    count: number;
}

export interface JobInputs {
    setup: JobSetup;
    materials: MaterialSelections;
    basement: BasementSection;
    firstFloor: FloorSection;
    secondFloor: FloorSection;
    roof: RoofSection;
    shingles: { sf: number; ridgeLF: number; hipLF: number; ridgecatLF: number; starterLF: number; roofVentCount: number; iceWaterLF: number };
    siding: SidingSection;
    trim: TrimSection;
    hardware: HardwareSection;
    exteriorDeck: ExteriorDeckSection;
    partyWall: PartyWallSection;
    windowsDoors: { windowCount: number; doors: DoorEntry[] };
    options: { description: string; price: number }[];
}

export interface LineItem {
    qty: number;
    uom: string;
    sku: string;
    description: string;
    group: string;
    is_dynamic_sku: boolean;
    tally?: string;
    warning?: string;
}

export interface Multipliers {
    framing: {
        stud_multiplier_basement: { value: number };
        stud_multiplier_main: { value: number };
        triple_plate_factor: { value: number };
        rim_multiplier: { value: number };
        bsmt_wall_wrap: { value: number };
        main_wall_wrap: { value: number };
        roof_ww_bracing: { value: number };
        twenty_percent_waste: { value: number };
    };
    sheathing: {
        osb_sf_per_panel: { value: number };
    };
    moisture_barrier: {
        sill_seal_roll_lf?: { value: number };
        tyvek_9ft: { value: number };
        tyvek_10ft: { value: number };
    };
    siding: {
        lp: Record<string, { pieces_per_100sf: number }>;
        hardie: Record<string, { pieces_per_100sf: number }>;
        vinyl: { default: { pieces_per_100sf: number } };
        soffit_lf_per_piece?: Record<string, number>;
    };
}

export interface Branch {
    branch_id: string;
    name: string;
    stud_sku?: string;
}

export interface HardwareMatrix {
    [finish: string]: { [func: string]: string | null };
}

export interface HardwareLookup {
    display_name: string;
    finish_code: string;
}

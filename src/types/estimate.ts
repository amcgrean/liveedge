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
    ext2x4_8ft: number;
    ext2x4_9ft: number;
    ext2x4_10ft: number;
    ext2x6_8ft: number;
    ext2x6_9ft: number;
    ext2x6_10ft: number;
    intWallLF: number;
    beamLF: number;
    stairCount: number;
    headers: HeaderEntry[];
}

export interface BasementSection extends WallSection {
    fhaCeilingHeight: number;  // ft — drives FHA post height/SKU
    fhaPostCount: number;      // user-entered count of FHA adjustable posts
    stoopJoistSize: string;    // '2x8' | '2x10' | '2x12'
    stoopSF: number;           // stoop square footage → joist qty + treated plywood
}

export interface FloorSection extends WallSection {
    deckSF: number;
    deckType: 'Edge T&G' | 'Gold Edge' | 'Advantech' | 'Diamond';
    tjiSize: string;
    tjiCount: number;   // user-entered count of I-joists
    garageWallLF: number;
}

export interface RoofSection {
    sheetingSF: number;
    postCount: number;
    postSize: string;
    headerSize: string;
    headerCount: number;
    soffitOverhang: number;
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
    };
    windowCount: number;
    windowLF: number;
    handrailType: string;
    handrailLF: number;
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
    beamSize: '2x8' | '2x10' | '2x12';
    deckingType: string;
    deckingLengths: number[];
    railingStyle: string;
    railingLF: number;
    postCount: number;
    stairCount: number;
    landing: boolean;
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
    shingles: { sf: number; ridgeLF: number; hipLF: number };
    siding: SidingSection;
    trim: TrimSection;
    hardware: HardwareSection;
    exteriorDeck: ExteriorDeckSection;
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

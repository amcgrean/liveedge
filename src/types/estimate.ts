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
    headers: { size: string; count: number }[];
}

export interface BasementSection extends WallSection {
    fhaCeilingHeight: number;
    stoopJoistSize: string;
}

export interface FloorSection extends WallSection {
    deckSF: number;
    deckType: 'Edge T&G' | 'Gold Edge' | 'Advantech' | 'Diamond';
    tjiSize: string;
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
    windowsDoors: { windowCount: number; doorCount: number };
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

// Data Lookup Interfaces
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
    [finish: string]: {
        [func: string]: string | null;
    };
}

export interface HardwareLookup {
    display_name: string;
    finish_code: string;
}

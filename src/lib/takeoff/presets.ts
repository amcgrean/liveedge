export interface MeasurementPreset {
  id: string;
  name: string;
  category: string;
  color: string;
  toolType: 'polyline' | 'polygon' | 'count';
  targetField: string; // dot-path into JobInputs, e.g. 'firstFloor.ext2x6_9ft'
  unit: string; // 'LF' | 'SF' | 'EA'
}

// Color palette — distinct per category for visual clarity
const COLORS = {
  basementExt: '#3b82f6',    // blue
  basementInt: '#ef4444',    // red
  basementOther: '#f59e0b',  // amber
  firstFloorExt: '#d946ef',  // magenta/fuchsia
  firstFloorInt: '#a855f7',  // purple
  firstFloorOther: '#ec4899', // pink
  secondFloorExt: '#22c55e', // green
  secondFloorInt: '#10b981', // emerald
  secondFloorOther: '#14b8a6', // teal
  roof: '#ef4444',           // red
  shingles: '#f97316',       // orange
  siding: '#84cc16',         // lime
  deck: '#06b6d4',           // cyan
  counts: '#8b5cf6',         // violet
};

// Generate wall presets for all heights and LSL variants per floor
type FloorKey = 'basement' | 'firstFloor' | 'secondFloor';
const FLOOR_DEFS: Array<{
  key: string; field: FloorKey; category: string;
  c4: string; c6: string; cInt: string; cOther: string;
}> = [
  { key: 'bsmt', field: 'basement',    category: 'Basement', c4: COLORS.basementExt,    c6: '#60a5fa', cInt: COLORS.basementInt,    cOther: COLORS.basementOther },
  { key: 'ff',   field: 'firstFloor',  category: '1st Floor', c4: COLORS.firstFloorExt, c6: '#e879f9', cInt: COLORS.firstFloorInt,  cOther: COLORS.firstFloorOther },
  { key: 'sf',   field: 'secondFloor', category: '2nd Floor', c4: COLORS.secondFloorExt, c6: '#4ade80', cInt: COLORS.secondFloorInt, cOther: COLORS.secondFloorOther },
];

const WALL_HEIGHTS = ['8ft','9ft','10ft','12ft','14ft','16ft','20ft'] as const;
const LSL_HEIGHTS  = ['8ft','9ft','10ft'] as const;

const wallPresets: MeasurementPreset[] = FLOOR_DEFS.flatMap((f) => [
  ...WALL_HEIGHTS.map(ht => ({
    id: `${f.key}-ext-2x4-${ht}`, name: `${f.category} Ext 2x4 ${ht.replace('ft','\'​')}`,
    category: f.category, color: f.c4, toolType: 'polyline' as const,
    targetField: `${f.field}.ext2x4_${ht}`, unit: 'LF',
  })),
  ...WALL_HEIGHTS.map(ht => ({
    id: `${f.key}-ext-2x6-${ht}`, name: `${f.category} Ext 2x6 ${ht.replace('ft','\'​')}`,
    category: f.category, color: f.c6, toolType: 'polyline' as const,
    targetField: `${f.field}.ext2x6_${ht}`, unit: 'LF',
  })),
  ...LSL_HEIGHTS.map(ht => ({
    id: `${f.key}-lsl-2x4-${ht}`, name: `${f.category} LSL 2x4 ${ht.replace('ft','\'​')}`,
    category: f.category, color: f.c4, toolType: 'polyline' as const,
    targetField: `${f.field}.ext2x4_lsl_${ht}`, unit: 'LF',
  })),
  ...LSL_HEIGHTS.map(ht => ({
    id: `${f.key}-lsl-2x6-${ht}`, name: `${f.category} LSL 2x6 ${ht.replace('ft','\'​')}`,
    category: f.category, color: f.c6, toolType: 'polyline' as const,
    targetField: `${f.field}.ext2x6_lsl_${ht}`, unit: 'LF',
  })),
  { id: `${f.key}-int`,     name: `${f.category} Int Walls`,     category: f.category, color: f.cInt,   toolType: 'polyline', targetField: `${f.field}.intWallLF`,     unit: 'LF' },
  { id: `${f.key}-bearing`, name: `${f.category} Bearing Walls`, category: f.category, color: f.cOther, toolType: 'polyline', targetField: `${f.field}.bearingWallLF`,  unit: 'LF' },
  { id: `${f.key}-finish`,  name: `${f.category} Finish Walls`,  category: f.category, color: f.cInt,   toolType: 'polyline', targetField: `${f.field}.finishWallLF`,   unit: 'LF' },
  { id: `${f.key}-rim`,     name: `${f.category} Rim Board`,     category: f.category, color: '#6366f1', toolType: 'polyline', targetField: `${f.field}.rimLF`,         unit: 'LF' },
  ...(f.field === 'basement' ? [
    { id: 'bsmt-beam',   name: 'Basement Beam',   category: 'Basement', color: COLORS.basementOther, toolType: 'polyline' as const, targetField: 'basement.beamLF',    unit: 'LF' },
    { id: 'bsmt-stoop',  name: 'Basement Stoop',  category: 'Basement', color: COLORS.basementOther, toolType: 'polygon'  as const, targetField: 'basement.stoopSF',   unit: 'SF' },
    { id: 'bsmt-stairs', name: 'Basement Stairs', category: 'Basement', color: COLORS.basementOther, toolType: 'count'    as const, targetField: 'basement.stairCount', unit: 'EA' },
  ] : [
    { id: `${f.key}-garage`, name: `${f.category} Garage Walls`, category: f.category, color: f.cOther, toolType: 'polyline' as const, targetField: `${f.field}.garageWallLF`, unit: 'LF' },
    { id: `${f.key}-beam`,   name: `${f.category} Beam`,         category: f.category, color: f.cOther, toolType: 'polyline' as const, targetField: `${f.field}.beamLF`,       unit: 'LF' },
    { id: `${f.key}-deck`,   name: `${f.category} Deck`,         category: f.category, color: f.cOther, toolType: 'polygon'  as const, targetField: `${f.field}.deckSF`,       unit: 'SF' },
    { id: `${f.key}-stairs`, name: `${f.category} Stairs`,       category: f.category, color: f.cOther, toolType: 'count'    as const, targetField: `${f.field}.stairCount`,   unit: 'EA' },
  ]),
]);

export const STANDARD_PRESETS: MeasurementPreset[] = [
  ...wallPresets,

  // ── Roof ──
  { id: 'roof-sheeting',  name: 'Roof Sheeting',   category: 'Roof', color: COLORS.roof,    toolType: 'polygon',  targetField: 'roof.sheetingSF',        unit: 'SF' },
  { id: 'roof-gable',     name: 'Gable Sheathing', category: 'Roof', color: '#f87171',      toolType: 'polygon',  targetField: 'roof.gableSF',           unit: 'SF' },
  { id: 'roof-rake',      name: 'Rake Edge',        category: 'Roof', color: '#fca5a5',      toolType: 'polyline', targetField: 'roof.rakeLF',            unit: 'LF' },
  { id: 'roof-soffit-lf', name: 'Soffit LF',        category: 'Roof', color: '#fecaca',      toolType: 'polyline', targetField: 'roof.soffitLF',          unit: 'LF' },
  { id: 'roof-valleys',   name: 'Valley Count',     category: 'Roof', color: '#fee2e2',      toolType: 'count',    targetField: 'roof.valleyCount',       unit: 'EA' },
  { id: 'roof-hucq',     name: 'HUCQ Ties',        category: 'Roof', color: '#fda4af',      toolType: 'count',    targetField: 'roof.hucqCount',         unit: 'EA' },
  { id: 'roof-vycor',    name: 'Vycor Flashing',   category: 'Roof', color: '#fecdd3',      toolType: 'polyline', targetField: 'roof.vycorLF',           unit: 'LF' },

  // ── Shingles ──
  { id: 'shingles-area',     name: 'Shingles Area',  category: 'Shingles', color: COLORS.shingles, toolType: 'polygon',  targetField: 'shingles.sf',           unit: 'SF' },
  { id: 'shingles-ridge',    name: 'Ridge Cap',      category: 'Shingles', color: '#fb923c',       toolType: 'polyline', targetField: 'shingles.ridgeLF',      unit: 'LF' },
  { id: 'shingles-hip',      name: 'Hip Cap',        category: 'Shingles', color: '#fdba74',       toolType: 'polyline', targetField: 'shingles.hipLF',        unit: 'LF' },
  { id: 'shingles-ridgecat', name: 'Ridgecat',       category: 'Shingles', color: '#fed7aa',       toolType: 'polyline', targetField: 'shingles.ridgecatLF',   unit: 'LF' },
  { id: 'shingles-starter',  name: 'Starter Strip',  category: 'Shingles', color: '#ffedd5',       toolType: 'polyline', targetField: 'shingles.starterLF',    unit: 'LF' },
  { id: 'shingles-icewater', name: 'Ice & Water',    category: 'Shingles', color: '#fef3c7',       toolType: 'polyline', targetField: 'shingles.iceWaterLF',   unit: 'LF' },
  { id: 'shingles-vents',    name: 'Roof Vents',     category: 'Shingles', color: '#fde68a',       toolType: 'count',    targetField: 'shingles.roofVentCount', unit: 'EA' },

  // ── Siding ──
  { id: 'siding-lap', name: 'Lap Siding', category: 'Siding', color: COLORS.siding, toolType: 'polygon', targetField: 'siding.lapSF', unit: 'SF' },
  { id: 'siding-shake', name: 'Shake Siding', category: 'Siding', color: '#a3e635', toolType: 'polygon', targetField: 'siding.shakeSF', unit: 'SF' },
  { id: 'siding-soffit', name: 'Soffit', category: 'Siding', color: '#bef264', toolType: 'polygon', targetField: 'siding.soffitSF', unit: 'SF' },
  { id: 'siding-porch-soffit', name: 'Porch Soffit', category: 'Siding', color: '#d9f99d', toolType: 'polygon', targetField: 'siding.porchSoffitSF', unit: 'SF' },
  { id: 'siding-trim', name: 'Trim Board', category: 'Siding', color: '#65a30d', toolType: 'polyline', targetField: 'siding.trimBoardLF', unit: 'LF' },
  { id: 'siding-corners', name: 'Corners', category: 'Siding', color: '#4d7c0f', toolType: 'count', targetField: 'siding.cornerCount', unit: 'EA' },

  // ── Exterior Deck ──
  { id: 'deck-area', name: 'Deck Area', category: 'Ext. Deck', color: COLORS.deck, toolType: 'polygon', targetField: 'exteriorDeck.deckSF', unit: 'SF' },
  { id: 'deck-railing', name: 'Deck Railing', category: 'Ext. Deck', color: '#67e8f9', toolType: 'polyline', targetField: 'exteriorDeck.railingLF', unit: 'LF' },
  { id: 'deck-ledger', name: 'Deck Ledger', category: 'Ext. Deck', color: '#22d3ee', toolType: 'polyline', targetField: 'exteriorDeck.ledgerLF', unit: 'LF' },
  { id: 'deck-posts', name: 'Deck Posts', category: 'Ext. Deck', color: '#0e7490', toolType: 'count', targetField: 'exteriorDeck.postCount', unit: 'EA' },
  { id: 'deck-facemount', name: 'Deck Hangers', category: 'Ext. Deck', color: '#0891b2', toolType: 'count', targetField: 'exteriorDeck.facemountQty', unit: 'EA' },

  // ── Counts ──
  { id: 'count-windows', name: 'Windows', category: 'Counts', color: COLORS.counts, toolType: 'count', targetField: 'windowsDoors.windowCount', unit: 'EA' },
  { id: 'count-roof-posts', name: 'Roof Posts', category: 'Counts', color: '#7c3aed', toolType: 'count', targetField: 'roof.postCount', unit: 'EA' },
  { id: 'count-deck-posts', name: 'Deck Posts', category: 'Counts', color: '#6d28d9', toolType: 'count', targetField: 'exteriorDeck.postCount', unit: 'EA' },
  { id: 'count-deck-stairs', name: 'Deck Stairs', category: 'Counts', color: '#5b21b6', toolType: 'count', targetField: 'exteriorDeck.stairCount', unit: 'EA' },
  { id: 'count-fha-posts', name: 'FHA Posts', category: 'Counts', color: '#4c1d95', toolType: 'count', targetField: 'basement.fhaPostCount', unit: 'EA' },

  // ── Floor System ──
  { id: 'ff-facemount', name: '1st Floor Hangers', category: '1st Floor', color: '#c084fc', toolType: 'count', targetField: 'firstFloor.facemountQty', unit: 'EA' },
  { id: 'ff-gypsum', name: '1st Floor Gypsum Ceiling', category: '1st Floor', color: '#e9d5ff', toolType: 'polygon', targetField: 'firstFloor.gypsumSF', unit: 'SF' },
  { id: 'sf-facemount', name: '2nd Floor Hangers', category: '2nd Floor', color: '#86efac', toolType: 'count', targetField: 'secondFloor.facemountQty', unit: 'EA' },
  { id: 'sf-gypsum', name: '2nd Floor Gypsum Ceiling', category: '2nd Floor', color: '#bbf7d0', toolType: 'polygon', targetField: 'secondFloor.gypsumSF', unit: 'SF' },

  // ── Trim extras ──
  { id: 'trim-crown',      name: 'Crown Moulding',    category: 'Trim', color: '#fcd34d', toolType: 'polyline', targetField: 'trim.crownLF',        unit: 'LF' },
  { id: 'trim-skirt',      name: 'Stair Skirt Board', category: 'Trim', color: '#fde68a', toolType: 'polyline', targetField: 'trim.skirtBoardLF',   unit: 'LF' },
  { id: 'trim-chair-rail', name: 'Chair Rail',        category: 'Trim', color: '#fef08a', toolType: 'polyline', targetField: 'trim.chairRailLF',    unit: 'LF' },
  { id: 'trim-shoe',       name: 'Shoe Moulding',     category: 'Trim', color: '#fef9c3', toolType: 'polyline', targetField: 'trim.shoeLF',         unit: 'LF' },
  { id: 'count-hr-brackets',   name: 'Handrail Brackets', category: 'Counts', color: '#fbbf24', toolType: 'count',    targetField: 'trim.handrailBracketCount',    unit: 'EA' },
  { id: 'count-pocket-doors',  name: 'Pocket Doors',      category: 'Counts', color: '#f59e0b', toolType: 'count',    targetField: 'trim.doorCounts.pocket30',     unit: 'EA' },
  { id: 'count-balusters',     name: 'Balusters',         category: 'Counts', color: '#d97706', toolType: 'count',    targetField: 'trim.balusterCount',           unit: 'EA' },
  { id: 'count-newels',        name: 'Newel Posts',       category: 'Counts', color: '#b45309', toolType: 'count',    targetField: 'trim.newelCount',              unit: 'EA' },

  // ── Party Wall ──
  { id: 'party-wall-lf', name: 'Party Wall', category: 'Party Wall', color: '#f43f5e', toolType: 'polyline', targetField: 'partyWall.lf', unit: 'LF' },

  // ── Beams (per floor) ──
  { id: 'bsmt-beam-2x10',  name: 'Basement Beam 2×10', category: 'Basement',  color: COLORS.basementOther,  toolType: 'polyline', targetField: 'basement.beam2x10LF',   unit: 'LF' },
  { id: 'bsmt-beam-2x12',  name: 'Basement Beam 2×12', category: 'Basement',  color: COLORS.basementOther,  toolType: 'polyline', targetField: 'basement.beam2x12LF',   unit: 'LF' },
  { id: 'ff-beam-2x10',    name: '1st Fl Beam 2×10',   category: '1st Floor', color: COLORS.firstFloorOther, toolType: 'polyline', targetField: 'firstFloor.beam2x10LF',  unit: 'LF' },
  { id: 'ff-beam-2x12',    name: '1st Fl Beam 2×12',   category: '1st Floor', color: COLORS.firstFloorOther, toolType: 'polyline', targetField: 'firstFloor.beam2x12LF',  unit: 'LF' },
  { id: 'sf-beam-2x10',    name: '2nd Fl Beam 2×10',   category: '2nd Floor', color: COLORS.secondFloorOther, toolType: 'polyline', targetField: 'secondFloor.beam2x10LF', unit: 'LF' },
  { id: 'sf-beam-2x12',    name: '2nd Fl Beam 2×12',   category: '2nd Floor', color: COLORS.secondFloorOther, toolType: 'polyline', targetField: 'secondFloor.beam2x12LF', unit: 'LF' },

  // ── Pocket Frames (per floor) ──
  { id: 'count-pocket-bsmt', name: 'Basement Pocket Frames', category: 'Basement',  color: COLORS.basementOther,   toolType: 'count', targetField: 'basement.pocketFrameCount',    unit: 'EA' },
  { id: 'count-pocket-ff',   name: '1st Fl Pocket Frames',   category: '1st Floor', color: COLORS.firstFloorOther,  toolType: 'count', targetField: 'firstFloor.pocketFrameCount',  unit: 'EA' },
  { id: 'count-pocket-sf',   name: '2nd Fl Pocket Frames',   category: '2nd Floor', color: COLORS.secondFloorOther, toolType: 'count', targetField: 'secondFloor.pocketFrameCount', unit: 'EA' },
];

/** Get all unique preset categories in display order */
export function getPresetCategories(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of STANDARD_PRESETS) {
    if (!seen.has(p.category)) {
      seen.add(p.category);
      result.push(p.category);
    }
  }
  return result;
}

/** Get presets filtered by category */
export function getPresetsByCategory(category: string): MeasurementPreset[] {
  return STANDARD_PRESETS.filter((p) => p.category === category);
}

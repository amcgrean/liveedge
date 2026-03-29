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

export const STANDARD_PRESETS: MeasurementPreset[] = [
  // ── Basement ──
  { id: 'bsmt-ext-2x4-8', name: 'Basement Ext 2x4 8\'', category: 'Basement', color: COLORS.basementExt, toolType: 'polyline', targetField: 'basement.ext2x4_8ft', unit: 'LF' },
  { id: 'bsmt-ext-2x4-9', name: 'Basement Ext 2x4 9\'', category: 'Basement', color: COLORS.basementExt, toolType: 'polyline', targetField: 'basement.ext2x4_9ft', unit: 'LF' },
  { id: 'bsmt-ext-2x4-10', name: 'Basement Ext 2x4 10\'', category: 'Basement', color: COLORS.basementExt, toolType: 'polyline', targetField: 'basement.ext2x4_10ft', unit: 'LF' },
  { id: 'bsmt-ext-2x6-8', name: 'Basement Ext 2x6 8\'', category: 'Basement', color: '#60a5fa', toolType: 'polyline', targetField: 'basement.ext2x6_8ft', unit: 'LF' },
  { id: 'bsmt-ext-2x6-9', name: 'Basement Ext 2x6 9\'', category: 'Basement', color: '#60a5fa', toolType: 'polyline', targetField: 'basement.ext2x6_9ft', unit: 'LF' },
  { id: 'bsmt-ext-2x6-10', name: 'Basement Ext 2x6 10\'', category: 'Basement', color: '#60a5fa', toolType: 'polyline', targetField: 'basement.ext2x6_10ft', unit: 'LF' },
  { id: 'bsmt-int', name: 'Basement Int Walls', category: 'Basement', color: COLORS.basementInt, toolType: 'polyline', targetField: 'basement.intWallLF', unit: 'LF' },
  { id: 'bsmt-beam', name: 'Basement Beam', category: 'Basement', color: COLORS.basementOther, toolType: 'polyline', targetField: 'basement.beamLF', unit: 'LF' },
  { id: 'bsmt-stoop', name: 'Basement Stoop', category: 'Basement', color: COLORS.basementOther, toolType: 'polygon', targetField: 'basement.stoopSF', unit: 'SF' },
  { id: 'bsmt-stairs', name: 'Basement Stairs', category: 'Basement', color: COLORS.basementOther, toolType: 'count', targetField: 'basement.stairCount', unit: 'EA' },

  // ── 1st Floor ──
  { id: 'ff-ext-2x4-8', name: '1st Floor Ext 2x4 8\'', category: '1st Floor', color: COLORS.firstFloorExt, toolType: 'polyline', targetField: 'firstFloor.ext2x4_8ft', unit: 'LF' },
  { id: 'ff-ext-2x4-9', name: '1st Floor Ext 2x4 9\'', category: '1st Floor', color: COLORS.firstFloorExt, toolType: 'polyline', targetField: 'firstFloor.ext2x4_9ft', unit: 'LF' },
  { id: 'ff-ext-2x4-10', name: '1st Floor Ext 2x4 10\'', category: '1st Floor', color: COLORS.firstFloorExt, toolType: 'polyline', targetField: 'firstFloor.ext2x4_10ft', unit: 'LF' },
  { id: 'ff-ext-2x6-8', name: '1st Floor Ext 2x6 8\'', category: '1st Floor', color: '#e879f9', toolType: 'polyline', targetField: 'firstFloor.ext2x6_8ft', unit: 'LF' },
  { id: 'ff-ext-2x6-9', name: '1st Floor Ext 2x6 9\'', category: '1st Floor', color: '#e879f9', toolType: 'polyline', targetField: 'firstFloor.ext2x6_9ft', unit: 'LF' },
  { id: 'ff-ext-2x6-10', name: '1st Floor Ext 2x6 10\'', category: '1st Floor', color: '#e879f9', toolType: 'polyline', targetField: 'firstFloor.ext2x6_10ft', unit: 'LF' },
  { id: 'ff-int', name: '1st Floor Int Walls', category: '1st Floor', color: COLORS.firstFloorInt, toolType: 'polyline', targetField: 'firstFloor.intWallLF', unit: 'LF' },
  { id: 'ff-garage', name: '1st Floor Garage Walls', category: '1st Floor', color: COLORS.firstFloorOther, toolType: 'polyline', targetField: 'firstFloor.garageWallLF', unit: 'LF' },
  { id: 'ff-beam', name: '1st Floor Beam', category: '1st Floor', color: COLORS.firstFloorOther, toolType: 'polyline', targetField: 'firstFloor.beamLF', unit: 'LF' },
  { id: 'ff-deck', name: '1st Floor Deck', category: '1st Floor', color: COLORS.firstFloorOther, toolType: 'polygon', targetField: 'firstFloor.deckSF', unit: 'SF' },
  { id: 'ff-stairs', name: '1st Floor Stairs', category: '1st Floor', color: COLORS.firstFloorOther, toolType: 'count', targetField: 'firstFloor.stairCount', unit: 'EA' },

  // ── 2nd Floor ──
  { id: 'sf-ext-2x4-8', name: '2nd Floor Ext 2x4 8\'', category: '2nd Floor', color: COLORS.secondFloorExt, toolType: 'polyline', targetField: 'secondFloor.ext2x4_8ft', unit: 'LF' },
  { id: 'sf-ext-2x4-9', name: '2nd Floor Ext 2x4 9\'', category: '2nd Floor', color: COLORS.secondFloorExt, toolType: 'polyline', targetField: 'secondFloor.ext2x4_9ft', unit: 'LF' },
  { id: 'sf-ext-2x4-10', name: '2nd Floor Ext 2x4 10\'', category: '2nd Floor', color: COLORS.secondFloorExt, toolType: 'polyline', targetField: 'secondFloor.ext2x4_10ft', unit: 'LF' },
  { id: 'sf-ext-2x6-8', name: '2nd Floor Ext 2x6 8\'', category: '2nd Floor', color: '#4ade80', toolType: 'polyline', targetField: 'secondFloor.ext2x6_8ft', unit: 'LF' },
  { id: 'sf-ext-2x6-9', name: '2nd Floor Ext 2x6 9\'', category: '2nd Floor', color: '#4ade80', toolType: 'polyline', targetField: 'secondFloor.ext2x6_9ft', unit: 'LF' },
  { id: 'sf-ext-2x6-10', name: '2nd Floor Ext 2x6 10\'', category: '2nd Floor', color: '#4ade80', toolType: 'polyline', targetField: 'secondFloor.ext2x6_10ft', unit: 'LF' },
  { id: 'sf-int', name: '2nd Floor Int Walls', category: '2nd Floor', color: COLORS.secondFloorInt, toolType: 'polyline', targetField: 'secondFloor.intWallLF', unit: 'LF' },
  { id: 'sf-garage', name: '2nd Floor Garage Walls', category: '2nd Floor', color: COLORS.secondFloorOther, toolType: 'polyline', targetField: 'secondFloor.garageWallLF', unit: 'LF' },
  { id: 'sf-beam', name: '2nd Floor Beam', category: '2nd Floor', color: COLORS.secondFloorOther, toolType: 'polyline', targetField: 'secondFloor.beamLF', unit: 'LF' },
  { id: 'sf-deck', name: '2nd Floor Deck', category: '2nd Floor', color: COLORS.secondFloorOther, toolType: 'polygon', targetField: 'secondFloor.deckSF', unit: 'SF' },
  { id: 'sf-stairs', name: '2nd Floor Stairs', category: '2nd Floor', color: COLORS.secondFloorOther, toolType: 'count', targetField: 'secondFloor.stairCount', unit: 'EA' },

  // ── Roof ──
  { id: 'roof-sheeting', name: 'Roof Sheeting', category: 'Roof', color: COLORS.roof, toolType: 'polygon', targetField: 'roof.sheetingSF', unit: 'SF' },

  // ── Shingles ──
  { id: 'shingles-area', name: 'Shingles Area', category: 'Shingles', color: COLORS.shingles, toolType: 'polygon', targetField: 'shingles.sf', unit: 'SF' },
  { id: 'shingles-ridge', name: 'Ridge Cap', category: 'Shingles', color: '#fb923c', toolType: 'polyline', targetField: 'shingles.ridgeLF', unit: 'LF' },
  { id: 'shingles-hip', name: 'Hip Cap', category: 'Shingles', color: '#fdba74', toolType: 'polyline', targetField: 'shingles.hipLF', unit: 'LF' },

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

  // ── Counts ──
  { id: 'count-windows', name: 'Windows', category: 'Counts', color: COLORS.counts, toolType: 'count', targetField: 'windowsDoors.windowCount', unit: 'EA' },
  { id: 'count-roof-posts', name: 'Roof Posts', category: 'Counts', color: '#7c3aed', toolType: 'count', targetField: 'roof.postCount', unit: 'EA' },
  { id: 'count-deck-posts', name: 'Deck Posts', category: 'Counts', color: '#6d28d9', toolType: 'count', targetField: 'exteriorDeck.postCount', unit: 'EA' },
  { id: 'count-deck-stairs', name: 'Deck Stairs', category: 'Counts', color: '#5b21b6', toolType: 'count', targetField: 'exteriorDeck.stairCount', unit: 'EA' },
  { id: 'count-fha-posts', name: 'FHA Posts', category: 'Counts', color: '#4c1d95', toolType: 'count', targetField: 'basement.fhaPostCount', unit: 'EA' },
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

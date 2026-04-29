// Shared address-classification helpers used by:
//   - /api/admin/jobs (filter junk addresses out of "Missing GPS" review list)
//   - the OpenAddresses backfill pipeline (only geocode rows that look real)

// `address_1` values stored in agility_customers that are NOT actual street
// addresses — counter/will-call accounts, person names, "general purchase"
// placeholders, etc. The local GeoJSON geocoder correctly fails on these and
// they should not appear in the Job Review "Missing GPS" list.
//
// Patterns are intentionally permissive on the right side; check trimmed
// lowercase input against `JUNK_ADDRESS_PATTERNS` to classify.
export const JUNK_ADDRESS_PATTERNS: RegExp[] = [
  /^will[\s-]*call/i,
  /\bwc\b\s*(only)?$/i,
  /^general\s+purchase/i,
  /^miscellaneous/i,
  /^misc\.?$/i,
  /^cash\s+(sale|account|customer)/i,
  /^pick[\s-]*up$/i,
  /^do\s+not\s+ship/i,
  /^see\s+(notes|sales)/i,
  /^need\s+address/i,
  /^no\s+address/i,
  /^tbd$/i,
  /^n\/a$/i,
];

/**
 * Returns true when `address_1` clearly isn't a street address and should be
 * excluded from geocoding / Missing-GPS review.
 *
 * Rules (any one match → junk):
 *  - empty / whitespace
 *  - contains no digit at all (placeholders, names like "Bill Goebel")
 *  - matches one of JUNK_ADDRESS_PATTERNS
 */
export function isJunkAddress(address: string | null | undefined): boolean {
  if (!address) return true;
  const trimmed = address.trim();
  if (trimmed.length === 0) return true;
  if (!/\d/.test(trimmed)) return true;
  for (const re of JUNK_ADDRESS_PATTERNS) {
    if (re.test(trimmed)) return true;
  }
  return false;
}

/**
 * SQL fragment string suitable for inlining into a postgres.js tagged template
 * to filter out junk addresses. Use as:
 *
 *   sql`... AND ${junkAddressSqlExclude('soh.shipto_address_1')}`
 *
 * Mirrors `isJunkAddress()` above. Keep these two in sync.
 */
export const JUNK_ADDRESS_SQL_REGEX =
  '^\\s*(' +
  [
    'will[\\s-]*call',
    'general\\s+purchase',
    'miscellaneous',
    'misc\\.?',
    'cash\\s+(sale|account|customer)',
    'pick[\\s-]*up',
    'do\\s+not\\s+ship',
    'see\\s+(notes|sales)',
    'need\\s+address',
    'no\\s+address',
    'tbd',
    'n\\/a',
  ].join('|') +
  ')\\s*$';

// ─── Address normalization (loader + lookup must agree) ──────────────────────

const STREET_TYPE_MAP: Record<string, string> = {
  STREET: 'ST', ST: 'ST',
  AVENUE: 'AVE', AVE: 'AVE', AV: 'AVE',
  ROAD: 'RD', RD: 'RD',
  DRIVE: 'DR', DR: 'DR',
  BOULEVARD: 'BLVD', BLVD: 'BLVD', BLV: 'BLVD',
  COURT: 'CT', CT: 'CT',
  LANE: 'LN', LN: 'LN',
  PLACE: 'PL', PL: 'PL',
  CIRCLE: 'CIR', CIR: 'CIR',
  TERRACE: 'TER', TER: 'TER', TERR: 'TER',
  PARKWAY: 'PKWY', PKWY: 'PKWY',
  HIGHWAY: 'HWY', HWY: 'HWY',
  TRAIL: 'TRL', TRL: 'TRL',
  WAY: 'WAY',
  SQUARE: 'SQ', SQ: 'SQ',
  PLAZA: 'PLZ', PLZ: 'PLZ',
  RUN: 'RUN',
  RIDGE: 'RDG', RDG: 'RDG',
  POINT: 'PT', PT: 'PT',
  CROSSING: 'XING', XING: 'XING',
  HEIGHTS: 'HTS', HTS: 'HTS',
};

const DIRECTION_MAP: Record<string, string> = {
  NORTH: 'N',     N:  'N',
  SOUTH: 'S',     S:  'S',
  EAST:  'E',     E:  'E',
  WEST:  'W',     W:  'W',
  NORTHEAST: 'NE', NE: 'NE',
  NORTHWEST: 'NW', NW: 'NW',
  SOUTHEAST: 'SE', SE: 'SE',
  SOUTHWEST: 'SW', SW: 'SW',
};

/**
 * Split `address_1` into number + street + unit, then normalize each.
 * Returns null if the address looks junk (cannot be reasonably parsed).
 *
 *   "1480 NW 96th Street, #5"   → { number_norm: "1480", street_norm: "NW 96TH ST", unit: "5" }
 *   "612 Rock Ridge Road"        → { number_norm: "612",  street_norm: "ROCK RDG RD", unit: null }
 *   "2921 Birchwood Drive"       → { number_norm: "2921", street_norm: "BIRCHWOOD DR", unit: null }
 */
export function normalizeAddress(raw: string | null | undefined): {
  number_norm: string;
  street_norm: string;
  unit: string | null;
} | null {
  if (!raw) return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  // Match leading house number (digits, optionally followed by letter or fraction)
  const m = cleaned.match(/^(\d+(?:[A-Z]|-?\d\/\d)?)\s+(.+)$/);
  if (!m) return null;

  const numberRaw = m[1];
  let rest = m[2];

  // Extract trailing unit ("APT 5", "# 5", "UNIT 5", "STE 200")
  let unit: string | null = null;
  const unitMatch = rest.match(/\s+(?:APT|UNIT|STE|SUITE|#)\s*([A-Z0-9-]+)\s*$/);
  if (unitMatch) {
    unit = unitMatch[1];
    rest = rest.slice(0, unitMatch.index).trim();
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const normalized = tokens.map((tok, idx) => {
    // Direction tokens collapse only at start or end of street
    if ((idx === 0 || idx === tokens.length - 1) && DIRECTION_MAP[tok]) {
      return DIRECTION_MAP[tok];
    }
    // Last token is usually street type
    if (idx === tokens.length - 1 && STREET_TYPE_MAP[tok]) {
      return STREET_TYPE_MAP[tok];
    }
    return tok;
  });

  const streetNorm = normalized.join(' ').replace(/\s+/g, ' ').trim();
  if (!streetNorm) return null;

  return { number_norm: numberRaw, street_norm: streetNorm, unit };
}

export function normalizeCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

export function normalizeZip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{5})/);
  return m ? m[1] : null;
}

export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, '').trim();
  return cleaned.length === 2 ? cleaned : null;
}

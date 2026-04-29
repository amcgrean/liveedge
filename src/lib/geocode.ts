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

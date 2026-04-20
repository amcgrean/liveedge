// Extracts PO/WO numbers, addresses, amounts, and descriptions from email text.

export interface ExtractedEmailData {
  emailType: 'po' | 'wo' | 'other';
  poNumber: string | null;
  woNumber: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  amount: number | null;
  description: string | null;
}

// US state abbreviations for address parsing
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

function firstMatch(patterns: RegExp[], text: string): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1]?.trim() ?? null;
  }
  return null;
}

function extractPoNumber(subject: string, body: string): string | null {
  const combined = `${subject}\n${body.slice(0, 2000)}`;
  return firstMatch([
    /\bP\.?O\.?\s*#\s*([A-Z0-9\-]{3,20})/i,
    /\bPurchase\s+Order\s*#?\s*([A-Z0-9\-]{3,20})/i,
    /\bOrder\s*(?:No\.?|Number)\s*:?\s*#?\s*([A-Z0-9\-]{3,20})/i,
    /\bPO\s*[-#:]\s*([A-Z0-9\-]{3,20})/i,
    /\bPO\s+([A-Z0-9]{4,20})\b/i,
  ], combined);
}

function extractWoNumber(subject: string, body: string): string | null {
  const combined = `${subject}\n${body.slice(0, 2000)}`;
  return firstMatch([
    /\bW\.?O\.?\s*#\s*([A-Z0-9\-]{3,20})/i,
    /\bWork\s+Order\s*#?\s*([A-Z0-9\-]{3,20})/i,
    /\bJob\s*(?:No\.?|Number|#)\s*:?\s*([A-Z0-9\-]{3,20})/i,
    /\bWO\s*[-#:]\s*([A-Z0-9\-]{3,20})/i,
    /\bWO\s+([A-Z0-9]{4,20})\b/i,
  ], combined);
}

// Common street type suffixes to help identify address lines
const STREET_TYPES = 'St(?:reet)?|Ave(?:nue)?|Rd|Road|Dr(?:ive)?|Ln|Lane|Blvd|Pkwy|Parkway|Ct(?:ourt)?|Cir(?:cle)?|Pl(?:ace)?|Trl|Trail|Hwy|Highway|Way|Loop|Run';

function extractAddress(body: string): {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  // Try labeled address lines first (ship to, job site, deliver to, etc.)
  const labeledBlock = body.match(
    /(?:ship\s+to|job\s+site|deliver\s+to|delivery\s+address|site\s+address|project\s+address|location)\s*:?\s*\n?([\s\S]{10,200})/i
  );

  const searchArea = labeledBlock ? labeledBlock[1] : body;
  const lines = searchArea.split(/\n|;/).map((l) => l.trim()).filter(Boolean);

  let address: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];

    // Look for a street address (starts with number, has street type)
    if (!address) {
      const streetMatch = line.match(
        new RegExp(`^(\\d{1,5}\\s+[\\w\\s]{2,40}?(?:${STREET_TYPES})(?:\\.)?(?:\\s+(?:Ste|Suite|Apt|Unit|#)\\s*[\\w-]+)?)\\b`, 'i')
      );
      if (streetMatch) {
        address = streetMatch[1].trim();

        // Try to parse city, state, zip from the same line or next line
        const restOfLine = line.slice(streetMatch[0].length).trim();
        const cityStateZip = parseCityStateZip(restOfLine) ?? parseCityStateZip(lines[i + 1] ?? '');
        if (cityStateZip) {
          city  = cityStateZip.city;
          state = cityStateZip.state;
          zip   = cityStateZip.zip;
        }
        continue;
      }
    }

    // If we have an address but no city/state/zip yet, try next line
    if (address && !city) {
      const cityStateZip = parseCityStateZip(line);
      if (cityStateZip) {
        city  = cityStateZip.city;
        state = cityStateZip.state;
        zip   = cityStateZip.zip;
        break;
      }
    }

    // Try a standalone city, state zip pattern (e.g. "Des Moines, IA 50301")
    if (!city) {
      const cityStateZip = parseCityStateZip(line);
      if (cityStateZip?.city && cityStateZip?.state) {
        city  = cityStateZip.city;
        state = cityStateZip.state;
        zip   = cityStateZip.zip;
      }
    }
  }

  // Fallback: scan whole text for zip codes to infer state
  if (!zip) {
    const zipMatch = (labeledBlock?.[1] ?? body).match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zipMatch) zip = zipMatch[1];
  }

  return { address, city, state, zip };
}

function parseCityStateZip(line: string): { city: string; state: string | null; zip: string | null } | null {
  // "Des Moines, IA 50301" or "Des Moines, Iowa 50301" or "Des Moines IA 50301"
  const m = line.match(/^([A-Za-z\s\.]{2,30}),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i);
  if (m) {
    const state = m[2].toUpperCase();
    if (US_STATES.has(state)) {
      return { city: m[1].trim(), state, zip: m[3] };
    }
  }
  // City and state only
  const m2 = line.match(/^([A-Za-z\s\.]{2,30}),?\s+([A-Z]{2})\s*$/i);
  if (m2 && US_STATES.has(m2[2].toUpperCase())) {
    return { city: m2[1].trim(), state: m2[2].toUpperCase(), zip: null };
  }
  return null;
}

function extractAmount(subject: string, body: string): number | null {
  const combined = `${subject}\n${body.slice(0, 3000)}`;
  // Look for labeled amounts first: Total, Amount, Contract Amount, etc.
  const labeled = combined.match(
    /(?:total|amount|contract\s+amount|bid\s+amount|invoice\s+amount|subtotal|grand\s+total)\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (labeled) {
    const v = parseFloat(labeled[1].replace(/,/g, ''));
    if (!isNaN(v) && v > 0) return v;
  }
  // Fallback: largest dollar amount in the text
  const allAmounts = [...combined.matchAll(/\$\s*([\d,]+\.\d{2})/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, '')))
    .filter((v) => !isNaN(v) && v > 0);
  if (allAmounts.length > 0) return Math.max(...allAmounts);
  return null;
}

function extractDescription(subject: string, body: string): string | null {
  // Try labeled description fields
  const labeled = body.match(
    /(?:description|scope\s+of\s+work|work\s+description|item\s+description|project\s+description)\s*:?\s*\n?([^\n]{10,200})/i
  );
  if (labeled) return labeled[1].trim();

  // Fall back to subject (strip PO/WO number prefix if present)
  const cleaned = subject
    .replace(/\b(?:P\.?O\.?|W\.?O\.?|Purchase\s+Order|Work\s+Order)\s*#?\s*[\w\-]+\s*/gi, '')
    .replace(/^(?:FW:|RE:|Fwd:)\s*/i, '')
    .trim();
  return cleaned.length >= 5 ? cleaned : null;
}

function detectEmailType(subject: string, body: string): 'po' | 'wo' | 'other' {
  const combined = `${subject}\n${body.slice(0, 500)}`.toLowerCase();
  const poScore = (combined.match(/\bpurchase\s+order\b|\bp\.?o\.?\b|\bpo\s*#/g) ?? []).length;
  const woScore = (combined.match(/\bwork\s+order\b|\bw\.?o\.?\b|\bwo\s*#|\bjob\s+(?:number|no|#)/g) ?? []).length;
  if (poScore > woScore) return 'po';
  if (woScore > poScore) return 'wo';
  if (poScore > 0) return 'po';
  if (woScore > 0) return 'wo';
  return 'other';
}

export function extractEmailData(subject: string, bodyText: string | null): ExtractedEmailData {
  const body = bodyText ?? '';
  const emailType = detectEmailType(subject, body);
  const poNumber  = extractPoNumber(subject, body);
  const woNumber  = extractWoNumber(subject, body);
  const amount    = extractAmount(subject, body);
  const desc      = extractDescription(subject, body);
  const { address, city, state, zip } = extractAddress(body || subject);

  return { emailType, poNumber, woNumber, address, city, state, zip, amount, description: desc };
}

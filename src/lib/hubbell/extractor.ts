// Extracts PO/WO numbers, addresses, amounts, dates, and descriptions from email text.

export interface ExtractedEmailData {
  emailType: 'po' | 'wo' | 'other';
  poNumber: string | null;
  woNumber: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  amount: number | null;
  taxAmount: number | null;
  shippingAmount: number | null;
  needByDate: string | null;
  contactName: string | null;
  contactPhone: string | null;
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
    /\bNew\s+PO(\d{4,})\b/i,   // "New PO001426-..."
    /\bPO(\d{4,})\b/i,          // PO001426 (no separator)
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
    /\bWO(\d{4,})\b/i,          // WO00014235 (no separator)
    /\bNew\s+WO(\d{4,})\b/i,    // "New WO00014235-..."
  ], combined);
}

// Common street type suffixes to help identify address lines
const STREET_TYPES = 'St(?:reet)?|Ave(?:nue)?|Rd|Road|Dr(?:ive)?|Ln|Lane|Blvd|Pkwy|Parkway|Ct(?:ourt)?|Cir(?:cle)?|Pl(?:ace)?|Trl|Trail|Hwy|Highway|Way|Loop|Run';

// Directional prefixes common in Iowa addresses
const DIRECTIONS = 'NE|NW|SE|SW|North|South|East|West|N|S|E|W';

// Extract an address embedded anywhere in a single-line string (no line-start anchor).
// Handles formats like "4403 NE 7th St" inside a longer subject line.
function extractInlineAddress(text: string): string | null {
  const m = text.match(
    new RegExp(
      `\\b(\\d{1,5}\\s+(?:(?:${DIRECTIONS})\\s+)?[\\w.]+(?:\\s+[\\w.]+){0,4}?\\s+(?:${STREET_TYPES})(?:\\.)?(?:\\s+(?:Ste|Suite|Apt|Unit|#)\\s*[\\w-]+)?)\\b`,
      'i'
    )
  );
  return m ? m[1].trim() : null;
}

// Parse the structured WO subject format used by this ERP:
// "New WO<n>-<Customer>-<Address>" or "New WO<n>-<Customer>-<Address>, <City>, <ST> <zip>"
function parseWoSubject(subject: string): {
  address: string | null; city: string | null; state: string | null; zip: string | null;
} | null {
  // Match: New WO12345-Customer Name-4403 NE 7th St[, City, ST zip]
  const m = subject.match(/\bNew\s+WO\d+[-\s]+[^-]+-\s*(\d{1,5}\s+.{3,60}?)(?:\s*,\s*([A-Za-z\s]+?)\s*,?\s*([A-Z]{2})\s+(\d{5}))?$/i);
  if (!m) return null;
  const rawAddr = m[1].trim();
  // Stop address at common delimiters if no explicit city block
  const address = rawAddr.split(/,|;|\s{2,}/)[0].trim();
  const city  = m[2]?.trim() ?? null;
  const state = m[3]?.toUpperCase() ?? null;
  const zip   = m[4] ?? null;
  return { address, city, state, zip };
}

// Same structure for PO subjects: "New PO<n>-<Customer>-<Address>[, City, ST zip]"
function parsePoSubject(subject: string): {
  address: string | null; city: string | null; state: string | null; zip: string | null;
} | null {
  const m = subject.match(/\bNew\s+PO\d+[-\s]+[^-]+-\s*(\d{1,5}\s+.{3,60}?)(?:\s*,\s*([A-Za-z\s]+?)\s*,?\s*([A-Z]{2})\s+(\d{5}))?$/i);
  if (!m) return null;
  const rawAddr = m[1].trim();
  const address = rawAddr.split(/,|;|\s{2,}/)[0].trim();
  const city  = m[2]?.trim() ?? null;
  const state = m[3]?.toUpperCase() ?? null;
  const zip   = m[4] ?? null;
  return { address, city, state, zip };
}

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

  // Fallback: scan inline for an embedded street address (catches addresses in subject lines)
  if (!address) {
    address = extractInlineAddress(body);
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
  const combined = `${subject}\n${body.slice(0, 5000)}`;
  // Labeled order/contract totals — skip tax and shipping
  const labeled = combined.match(
    /(?:order\s+total|grand\s+total|contract\s+amount|bid\s+amount|subtotal|invoice\s+(?:total|amount)|total\s+amount|amount\s+due)\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (labeled) {
    const v = parseFloat(labeled[1].replace(/,/g, ''));
    if (!isNaN(v) && v > 0) return v;
  }
  // Generic total / amount label
  const generic = combined.match(
    /(?:total|amount)\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (generic) {
    const v = parseFloat(generic[1].replace(/,/g, ''));
    if (!isNaN(v) && v > 0) return v;
  }
  // Fallback: largest dollar amount in the text
  const allAmounts = [...combined.matchAll(/\$\s*([\d,]+\.\d{2})/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, '')))
    .filter((v) => !isNaN(v) && v > 0);
  if (allAmounts.length > 0) return Math.max(...allAmounts);
  return null;
}

function extractTaxAmount(body: string): number | null {
  const m = body.slice(0, 5000).match(
    /(?:tax|sales\s+tax|tax\s+amount)\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return !isNaN(v) && v > 0 ? v : null;
}

function extractShippingAmount(body: string): number | null {
  const m = body.slice(0, 5000).match(
    /(?:shipping|freight|delivery\s+charge|handling)\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return !isNaN(v) && v > 0 ? v : null;
}

// Parse a variety of date formats into ISO date string (YYYY-MM-DD)
function parseDate(raw: string): string | null {
  // Try MM/DD/YYYY, MM-DD-YYYY
  const mdy = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mdy) {
    const year = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3];
    const month = mdy[1].padStart(2, '0');
    const day   = mdy[2].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // Try "January 15, 2026" or "Jan 15 2026"
  const months: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  };
  const named = raw.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const mo = months[named[1].toLowerCase().slice(0, 3)];
    if (mo) return `${named[3]}-${mo}-${named[2].padStart(2, '0')}`;
  }
  return null;
}

function extractNeedByDate(subject: string, body: string): string | null {
  const combined = `${subject}\n${body.slice(0, 3000)}`;
  const m = combined.match(
    /(?:need(?:ed)?\s+by|required\s+by|required\s+date|due\s+date|deliver\s+by|delivery\s+date|ship\s+by|expected\s+date|request(?:ed)?\s+date|want\s+date)\s*:?\s*([^\n,]{5,30})/i
  );
  if (!m) return null;
  return parseDate(m[1].trim());
}

function extractContactName(body: string): string | null {
  return firstMatch([
    /(?:contact|ordered\s+by|requested\s+by|attention|attn)\s*:?\s*([A-Za-z][A-Za-z\s\-\.]{2,40}?)(?:\n|,|\s{2}|$)/i,
  ], body.slice(0, 3000));
}

function extractContactPhone(body: string): string | null {
  const m = body.slice(0, 3000).match(
    /(?:phone|cell|mobile|tel|call)\s*:?\s*([\d\s\(\)\-\.+]{7,20})/i
  );
  if (m) return m[1].trim().replace(/\s+/g, ' ');
  // Standalone phone number pattern
  const standalone = body.slice(0, 3000).match(/\b(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})\b/);
  return standalone ? standalone[1] : null;
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
  const poScore = (combined.match(/\bpurchase\s+order\b|\bp\.?o\.?\b|\bpo\s*#|\bpo\d{3,}/g) ?? []).length;
  const woScore = (combined.match(/\bwork\s+order\b|\bw\.?o\.?\b|\bwo\s*#|\bjob\s+(?:number|no|#)|\bwo\d{4,}|\bnew\s+wo\d/g) ?? []).length;
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
  const taxAmount     = extractTaxAmount(body);
  const shippingAmount = extractShippingAmount(body);
  const needByDate = extractNeedByDate(subject, body);
  const contactName  = extractContactName(body);
  const contactPhone = extractContactPhone(body);
  const desc      = extractDescription(subject, body);

  // Try structured subject formats first ("New WO<n>-Customer-Address" / "New PO<n>-...")
  const woSubject = parseWoSubject(subject);
  const poSubject = parsePoSubject(subject);
  const bodyAddr  = extractAddress(body || subject);

  const address = woSubject?.address ?? poSubject?.address ?? bodyAddr.address;
  const city    = woSubject?.city    ?? poSubject?.city    ?? bodyAddr.city;
  const state   = woSubject?.state   ?? poSubject?.state   ?? bodyAddr.state;
  const zip     = woSubject?.zip     ?? poSubject?.zip     ?? bodyAddr.zip;

  return {
    emailType, poNumber, woNumber,
    address, city, state, zip,
    amount, taxAmount, shippingAmount,
    needByDate, contactName, contactPhone,
    description: desc,
  };
}

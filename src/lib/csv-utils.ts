import Papa from 'papaparse';

/**
 * Parse a CSV string into typed rows.
 */
export function parseCSV<T extends Record<string, unknown>>(
  csvString: string,
  options?: { header?: boolean; skipEmptyLines?: boolean }
): { data: T[]; errors: Papa.ParseError[] } {
  const result = Papa.parse<T>(csvString, {
    header: options?.header ?? true,
    skipEmptyLines: options?.skipEmptyLines ?? true,
    dynamicTyping: true,
  });
  return { data: result.data, errors: result.errors };
}

/**
 * Generate a CSV string from an array of objects.
 */
export function generateCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns?: string[]
): string {
  return Papa.unparse(rows, { columns });
}

/**
 * Create a downloadable CSV response.
 */
export function csvResponse(csvString: string, filename: string): Response {
  return new Response(csvString, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Calculate total length of a polyline in real-world units.
 * @param points Array of {x, y} pixel coordinates
 * @param pixelsPerUnit Calibrated pixels per real-world unit (e.g., pixels per foot)
 * @returns Length in real-world units (e.g., feet)
 */
export function calcPolylineLength(points: Point[], pixelsPerUnit: number): number {
  if (points.length < 2 || pixelsPerUnit <= 0) return 0;
  let totalPixels = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalPixels += Math.sqrt(dx * dx + dy * dy);
  }
  return totalPixels / pixelsPerUnit;
}

/**
 * Calculate individual segment lengths for label display.
 */
export function calcSegmentLengths(points: Point[], pixelsPerUnit: number): number[] {
  if (points.length < 2 || pixelsPerUnit <= 0) return [];
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    lengths.push(Math.sqrt(dx * dx + dy * dy) / pixelsPerUnit);
  }
  return lengths;
}

/**
 * Calculate area of a polygon using the Shoelace formula.
 * @param points Array of {x, y} pixel coordinates (vertices, in order)
 * @param pixelsPerUnit Calibrated pixels per real-world unit
 * @returns Area in real-world square units (e.g., square feet)
 */
export function calcPolygonArea(points: Point[], pixelsPerUnit: number): number {
  if (points.length < 3 || pixelsPerUnit <= 0) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2 / (pixelsPerUnit * pixelsPerUnit);
}

/**
 * Calculate polygon area with void cutouts subtracted.
 */
export function calcPolygonAreaWithVoids(
  outerPoints: Point[],
  voids: Point[][],
  pixelsPerUnit: number
): number {
  let area = calcPolygonArea(outerPoints, pixelsPerUnit);
  for (const v of voids) {
    area -= calcPolygonArea(v, pixelsPerUnit);
  }
  return Math.max(0, area);
}

/**
 * Simple count — just returns array length.
 */
export function calcCount(markers: Point[]): number {
  return markers.length;
}

/**
 * Calculate the pixel distance between two points.
 */
export function calcPixelDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Derive pixelsPerUnit from a calibration: two clicked points and a known real-world distance.
 */
export function pixelsPerUnitFromCalibration(
  p1: Point,
  p2: Point,
  realWorldDistance: number
): number {
  if (realWorldDistance <= 0) return 0;
  return calcPixelDistance(p1, p2) / realWorldDistance;
}

/**
 * Calculate the midpoint of a line segment (for label placement).
 */
export function midpoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

/**
 * Format a measurement value for display.
 * LF and SF get 1 decimal, EA gets 0.
 */
export function formatMeasurement(value: number, unit: string): string {
  if (unit === 'EA') return `${Math.round(value)} EA`;
  return `${value.toFixed(1)} ${unit}`;
}

// ── Architectural Scale Presets ──

export interface ScalePreset {
  name: string;
  label: string;
  ratio: number; // drawing inches per real foot (e.g., 1/4" = 1' → 0.25 in per 12 in → ratio of 48)
}

/**
 * Standard architectural scales.
 * ratio = real inches / drawing inches
 * e.g., 1/4" = 1'-0" means 0.25 drawing inches = 12 real inches → ratio = 48
 */
export const SCALE_PRESETS: ScalePreset[] = [
  { name: '1/8" = 1\'-0"', label: '1/8"', ratio: 96 },
  { name: '3/16" = 1\'-0"', label: '3/16"', ratio: 64 },
  { name: '1/4" = 1\'-0"', label: '1/4"', ratio: 48 },
  { name: '3/8" = 1\'-0"', label: '3/8"', ratio: 32 },
  { name: '1/2" = 1\'-0"', label: '1/2"', ratio: 24 },
  { name: '3/4" = 1\'-0"', label: '3/4"', ratio: 16 },
  { name: '1" = 1\'-0"', label: '1"', ratio: 12 },
  { name: '1-1/2" = 1\'-0"', label: '1-1/2"', ratio: 8 },
];

/**
 * Given a scale preset and the PDF render DPI, compute pixelsPerUnit (pixels per foot).
 * PDF default is 72 DPI. At 1/4"=1' scale (ratio=48), one foot = 72/48 * 1 = 1.5 pixels at native.
 * With render scale applied: pixelsPerFoot = (renderDPI / ratio)
 */
export function pixelsPerUnitFromScale(scaleRatio: number, renderDPI: number = 72): number {
  if (scaleRatio <= 0) return 0;
  return renderDPI / scaleRatio;
}

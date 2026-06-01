import { describe, it, expect } from 'vitest';
import {
  calcPolylineLength,
  calcSegmentLengths,
  calcPolygonArea,
  calcPolygonAreaWithVoids,
  calcCount,
  calcPixelDistance,
  pixelsPerUnitFromCalibration,
  midpoint,
  formatMeasurement,
  pixelsPerUnitFromScale,
  SCALE_PRESETS,
  type Point,
} from './calculations';

// Polyline length is what feeds linear-feet totals into bid inputs (ext walls,
// trim runs, etc.). A bad scale or off-by-N here writes the wrong qty straight
// into "Send to Estimate" — high blast radius.
describe('calcPolylineLength', () => {
  it('returns 0 when fewer than 2 points', () => {
    expect(calcPolylineLength([], 1)).toBe(0);
    expect(calcPolylineLength([{ x: 0, y: 0 }], 1)).toBe(0);
  });

  it('returns 0 when pixelsPerUnit is zero or negative', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(calcPolylineLength(pts, 0)).toBe(0);
    expect(calcPolylineLength(pts, -10)).toBe(0);
  });

  it('measures a horizontal segment in real-world units', () => {
    // 100 px / 10 px-per-ft = 10 ft
    expect(
      calcPolylineLength(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        10
      )
    ).toBe(10);
  });

  it('handles 3-4-5 right triangle hypotenuse', () => {
    expect(
      calcPolylineLength(
        [
          { x: 0, y: 0 },
          { x: 30, y: 40 },
        ],
        1
      )
    ).toBe(50);
  });

  it('sums multiple segments correctly', () => {
    // L-shape: 10 ft right, then 10 ft up
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(calcPolylineLength(pts, 10)).toBe(20);
  });

  it('matches calcSegmentLengths total', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 60, y: 80 },
      { x: 60, y: 80 + 50 },
    ];
    const total = calcPolylineLength(pts, 10);
    const segs = calcSegmentLengths(pts, 10);
    const summed = segs.reduce((a, b) => a + b, 0);
    expect(summed).toBeCloseTo(total, 10);
  });
});

describe('calcSegmentLengths', () => {
  it('returns empty array for fewer than 2 points', () => {
    expect(calcSegmentLengths([], 1)).toEqual([]);
    expect(calcSegmentLengths([{ x: 0, y: 0 }], 1)).toEqual([]);
  });

  it('returns empty array for invalid scale', () => {
    expect(
      calcSegmentLengths(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        0
      )
    ).toEqual([]);
  });

  it('returns one length per segment (N-1 segments for N points)', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const segs = calcSegmentLengths(pts, 1);
    expect(segs).toHaveLength(3);
    expect(segs).toEqual([10, 10, 10]);
  });
});

// Polygon area drives SF totals (slab area, roof SF, deck SF). Shoelace must
// stay sign-independent so vertex winding direction doesn't flip the answer.
describe('calcPolygonArea', () => {
  it('returns 0 for fewer than 3 points', () => {
    expect(calcPolygonArea([], 1)).toBe(0);
    expect(
      calcPolygonArea(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        1
      )
    ).toBe(0);
  });

  it('returns 0 for invalid scale', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(calcPolygonArea(square, 0)).toBe(0);
    expect(calcPolygonArea(square, -5)).toBe(0);
  });

  it('computes a 10×10 unit square at pixelsPerUnit=1', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(calcPolygonArea(square, 1)).toBe(100);
  });

  it('returns positive area regardless of vertex winding (CW vs CCW)', () => {
    const ccw: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const cw = [...ccw].reverse();
    expect(calcPolygonArea(ccw, 1)).toBe(calcPolygonArea(cw, 1));
  });

  it('scales area by 1/pixelsPerUnit² (not 1/pixelsPerUnit)', () => {
    // 100×100 px square at 10 px-per-ft → 10ft × 10ft = 100 SF, NOT 1000 SF.
    // Off-by-one-factor here is a 10×+ overstatement bug class.
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(calcPolygonArea(square, 10)).toBe(100);
  });

  it('computes a right triangle area = 1/2 base × height', () => {
    const tri: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(calcPolygonArea(tri, 1)).toBe(50);
  });
});

describe('calcPolygonAreaWithVoids', () => {
  const outer: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('returns outer area when no voids', () => {
    expect(calcPolygonAreaWithVoids(outer, [], 1)).toBe(100);
  });

  it('subtracts a single void', () => {
    const vd: Point[] = [
      { x: 2, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 5 },
      { x: 2, y: 5 },
    ];
    // 100 - 9
    expect(calcPolygonAreaWithVoids(outer, [vd], 1)).toBe(91);
  });

  it('subtracts multiple voids', () => {
    const a: Point[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const b: Point[] = [
      { x: 5, y: 5 },
      { x: 8, y: 5 },
      { x: 8, y: 8 },
      { x: 5, y: 8 },
    ];
    // 100 - 4 - 9
    expect(calcPolygonAreaWithVoids(outer, [a, b], 1)).toBe(87);
  });

  it('clamps to 0 when voids exceed outer (never returns negative area)', () => {
    const tiny: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const oversizedVoid: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(calcPolygonAreaWithVoids(tiny, [oversizedVoid], 1)).toBe(0);
  });
});

describe('calcCount', () => {
  it('returns the number of markers', () => {
    expect(calcCount([])).toBe(0);
    expect(calcCount([{ x: 1, y: 1 }])).toBe(1);
    expect(
      calcCount([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ])
    ).toBe(3);
  });
});

describe('calcPixelDistance', () => {
  it('returns 0 for the same point', () => {
    expect(calcPixelDistance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
  it('computes Euclidean distance', () => {
    expect(calcPixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('is symmetric', () => {
    const a = { x: -2, y: 5 };
    const b = { x: 8, y: -3 };
    expect(calcPixelDistance(a, b)).toBe(calcPixelDistance(b, a));
  });
});

// Calibration sets pixelsPerUnit for every subsequent measurement on a
// viewport — getting this wrong scales the entire takeoff.
describe('pixelsPerUnitFromCalibration', () => {
  it('returns 0 when realWorldDistance is zero or negative', () => {
    expect(pixelsPerUnitFromCalibration({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBe(0);
    expect(pixelsPerUnitFromCalibration({ x: 0, y: 0 }, { x: 10, y: 0 }, -5)).toBe(0);
  });

  it('divides pixel distance by real-world distance', () => {
    // 120 px = 10 ft → 12 px/ft
    expect(
      pixelsPerUnitFromCalibration({ x: 0, y: 0 }, { x: 120, y: 0 }, 10)
    ).toBe(12);
  });

  it('round-trips: calcPolylineLength after calibration yields the calibration distance', () => {
    const p1 = { x: 10, y: 10 };
    const p2 = { x: 10 + 96, y: 10 };
    const realFt = 8;
    const ppu = pixelsPerUnitFromCalibration(p1, p2, realFt);
    expect(calcPolylineLength([p1, p2], ppu)).toBeCloseTo(realFt, 10);
  });
});

describe('midpoint', () => {
  it('returns the midpoint of two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
  it('handles negative coordinates', () => {
    expect(midpoint({ x: -4, y: -8 }, { x: 4, y: 8 })).toEqual({ x: 0, y: 0 });
  });
});

describe('formatMeasurement', () => {
  it('rounds and emits "EA" with no decimals', () => {
    expect(formatMeasurement(3.49, 'EA')).toBe('3 EA');
    expect(formatMeasurement(3.5, 'EA')).toBe('4 EA');
    expect(formatMeasurement(0, 'EA')).toBe('0 EA');
  });
  it('emits LF with 1 decimal', () => {
    expect(formatMeasurement(12.345, 'LF')).toBe('12.3 LF');
    expect(formatMeasurement(0, 'LF')).toBe('0.0 LF');
  });
  it('emits SF with 1 decimal', () => {
    expect(formatMeasurement(100.07, 'SF')).toBe('100.1 SF');
  });
});

// Scale presets feed pixelsPerUnit when a user picks "1/4\" = 1'" from the
// dropdown instead of calibrating manually. A wrong ratio writes the wrong
// scale everywhere downstream.
describe('SCALE_PRESETS', () => {
  it('contains the standard architectural scales', () => {
    const ratios = Object.fromEntries(SCALE_PRESETS.map((p) => [p.label, p.ratio]));
    expect(ratios['1/4"']).toBe(48);
    expect(ratios['1/8"']).toBe(96);
    expect(ratios['1/2"']).toBe(24);
    expect(ratios['1"']).toBe(12);
  });
});

describe('pixelsPerUnitFromScale', () => {
  it('returns 0 for non-positive ratio', () => {
    expect(pixelsPerUnitFromScale(0)).toBe(0);
    expect(pixelsPerUnitFromScale(-1)).toBe(0);
  });
  it('defaults to 72 DPI', () => {
    // 1/4" scale ratio=48 → 72/48 = 1.5 px/ft at native render
    expect(pixelsPerUnitFromScale(48)).toBeCloseTo(1.5, 10);
  });
  it('scales linearly with render DPI', () => {
    expect(pixelsPerUnitFromScale(48, 144)).toBeCloseTo(3, 10);
    expect(pixelsPerUnitFromScale(48, 288)).toBeCloseTo(6, 10);
  });
});

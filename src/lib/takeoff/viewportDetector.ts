export interface ViewportBounds {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Given a cursor position, find which viewport the cursor is inside.
 * Viewports are few per page (typically 2-5), so linear scan is O(1) in practice.
 * Returns the smallest viewport containing the point (most specific match).
 */
export function findViewportAtPoint(
  viewports: ViewportBounds[],
  x: number,
  y: number
): string | null {
  let bestMatch: ViewportBounds | null = null;
  let bestArea = Infinity;

  for (const vp of viewports) {
    if (x >= vp.x && x <= vp.x + vp.w && y >= vp.y && y <= vp.y + vp.h) {
      const area = vp.w * vp.h;
      if (area < bestArea) {
        bestMatch = vp;
        bestArea = area;
      }
    }
  }

  return bestMatch?.id ?? null;
}

/**
 * Check if a point is inside a specific viewport.
 */
export function isPointInViewport(
  vp: ViewportBounds,
  x: number,
  y: number
): boolean {
  return x >= vp.x && x <= vp.x + vp.w && y >= vp.y && y <= vp.y + vp.h;
}

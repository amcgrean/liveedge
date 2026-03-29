import { Canvas, Rect, Line, Polyline as FabricPolyline, Polygon as FabricPolygon, Circle, Group, Text, Path, PencilBrush, Point as FabricPoint } from 'fabric';
import type { TPointerEvent, TPointerEventInfo } from 'fabric';

// ── Canvas Setup ──

/**
 * Initialize a Fabric.js canvas on top of the PDF canvas.
 */
export function initFabricCanvas(
  canvasEl: HTMLCanvasElement,
  width: number,
  height: number
): Canvas {
  const canvas = new Canvas(canvasEl, {
    width,
    height,
    selection: true,
    preserveObjectStacking: true,
    renderOnAddRemove: true,
    stopContextMenu: true,
    fireRightClick: true,
  });
  return canvas;
}

/**
 * Resize the Fabric canvas to match new dimensions.
 */
export function resizeFabricCanvas(canvas: Canvas, width: number, height: number): void {
  canvas.setDimensions({ width, height });
  canvas.renderAll();
}

// ── Zoom ──

/**
 * Set zoom level using Fabric's built-in zoom transform.
 * Never repositions individual objects.
 */
export function setCanvasZoom(
  canvas: Canvas,
  zoom: number,
  centerPoint?: { x: number; y: number }
): void {
  const clampedZoom = Math.min(Math.max(zoom, 0.1), 10);
  if (centerPoint) {
    canvas.zoomToPoint(new FabricPoint(centerPoint.x, centerPoint.y), clampedZoom);
  } else {
    canvas.setZoom(clampedZoom);
  }
  canvas.renderAll();
}

/**
 * Get current zoom level.
 */
export function getCanvasZoom(canvas: Canvas): number {
  return canvas.getZoom();
}

// ── Pan ──

/**
 * Pan the canvas by a delta.
 */
export function panCanvas(canvas: Canvas, deltaX: number, deltaY: number): void {
  const vpt = canvas.viewportTransform;
  if (!vpt) return;
  vpt[4] += deltaX;
  vpt[5] += deltaY;
  canvas.setViewportTransform(vpt);
  canvas.renderAll();
}

// ── Serialization ──

/**
 * Serialize the Fabric canvas to JSON for storage.
 */
export function serializeCanvas(canvas: Canvas): object {
  return canvas.toJSON();
}

/**
 * Restore a Fabric canvas from saved JSON.
 */
export async function restoreCanvas(canvas: Canvas, json: object): Promise<void> {
  await canvas.loadFromJSON(json);
  canvas.renderAll();
}

/**
 * Clear all objects from the Fabric canvas.
 */
export function clearCanvas(canvas: Canvas): void {
  canvas.clear();
  canvas.renderAll();
}

// ── Viewport Rectangle ──

/**
 * Create a viewport rectangle on the canvas (dashed border, labeled).
 */
export function createViewportRect(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  isActive: boolean = false
): Group {
  const rect = new Rect({
    left: 0,
    top: 0,
    width,
    height,
    fill: 'transparent',
    stroke: isActive ? '#22d3ee' : '#64748b',
    strokeWidth: isActive ? 2 : 1,
    strokeDashArray: [8, 4],
    opacity: isActive ? 0.8 : 0.4,
  });

  const label = new Text(name, {
    left: 4,
    top: 4,
    fontSize: 12,
    fill: isActive ? '#22d3ee' : '#94a3b8',
    fontFamily: 'monospace',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  });

  const group = new Group([rect, label], {
    left: x,
    top: y,
    selectable: false,
    evented: false,
    id: `viewport-${id}`,
  } as Record<string, unknown>);

  return group;
}

// ── Measurement Objects ──

/**
 * Create a polyline measurement on the canvas with segment labels.
 */
export function createMeasurementPolyline(
  points: Array<{ x: number; y: number }>,
  color: string,
  segmentLabels: string[],
  totalLabel: string,
  id: string,
  groupId: string,
  presetId: string
): Group {
  const objects: (Line | Text | Circle)[] = [];

  // Draw line segments
  for (let i = 1; i < points.length; i++) {
    const line = new Line(
      [points[i - 1].x, points[i - 1].y, points[i].x, points[i].y],
      {
        stroke: color,
        strokeWidth: 2,
        selectable: false,
        evented: false,
      }
    );
    objects.push(line);

    // Segment label at midpoint
    if (segmentLabels[i - 1]) {
      const mx = (points[i - 1].x + points[i].x) / 2;
      const my = (points[i - 1].y + points[i].y) / 2;
      const label = new Text(segmentLabels[i - 1], {
        left: mx,
        top: my - 14,
        fontSize: 10,
        fill: color,
        fontFamily: 'monospace',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        textAlign: 'center',
        selectable: false,
        evented: false,
      });
      objects.push(label);
    }
  }

  // Node circles at each point
  for (const pt of points) {
    const circle = new Circle({
      left: pt.x - 3,
      top: pt.y - 3,
      radius: 3,
      fill: color,
      stroke: '#fff',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    });
    objects.push(circle);
  }

  // Total label at end
  if (totalLabel && points.length > 0) {
    const lastPt = points[points.length - 1];
    const endLabel = new Text(totalLabel, {
      left: lastPt.x + 8,
      top: lastPt.y - 8,
      fontSize: 12,
      fill: '#fff',
      fontFamily: 'monospace',
      backgroundColor: color,
      padding: 3,
      selectable: false,
      evented: false,
    });
    objects.push(endLabel);
  }

  const group = new Group(objects, {
    selectable: true,
    evented: true,
    hasBorders: true,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
    hoverCursor: 'pointer',
    id: `measurement-${id}`,
    measurementId: id,
    measurementType: 'polyline',
    groupId,
    presetId,
  } as Record<string, unknown>);

  return group;
}

/**
 * Create a polygon area measurement on the canvas.
 */
export function createMeasurementPolygon(
  points: Array<{ x: number; y: number }>,
  color: string,
  areaLabel: string,
  id: string,
  groupId: string,
  presetId: string
): Group {
  const polygon = new FabricPolygon(points, {
    fill: `${color}20`, // very low opacity fill
    stroke: color,
    strokeWidth: 2,
    selectable: false,
    evented: false,
  });

  // Calculate centroid for label placement
  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  const label = new Text(areaLabel, {
    left: cx,
    top: cy,
    fontSize: 14,
    fill: '#fff',
    fontFamily: 'monospace',
    backgroundColor: color,
    padding: 4,
    textAlign: 'center',
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
  });

  // Node circles
  const circles = points.map(
    (pt) =>
      new Circle({
        left: pt.x - 3,
        top: pt.y - 3,
        radius: 3,
        fill: color,
        stroke: '#fff',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      })
  );

  const group = new Group([polygon, label, ...circles], {
    selectable: true,
    evented: true,
    hasBorders: true,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
    hoverCursor: 'pointer',
    id: `measurement-${id}`,
    measurementId: id,
    measurementType: 'polygon',
    groupId,
    presetId,
  } as Record<string, unknown>);

  return group;
}

/**
 * Create a count marker on the canvas.
 */
export function createCountMarker(
  x: number,
  y: number,
  number: number,
  color: string,
  id: string,
  groupId: string,
  presetId: string
): Group {
  const circle = new Circle({
    left: -12,
    top: -12,
    radius: 12,
    fill: color,
    stroke: '#fff',
    strokeWidth: 2,
  });

  const label = new Text(String(number), {
    left: 0,
    top: 0,
    fontSize: 12,
    fill: '#fff',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    originX: 'center',
    originY: 'center',
  });

  const group = new Group([circle, label], {
    left: x,
    top: y,
    originX: 'center',
    originY: 'center',
    selectable: true,
    evented: true,
    hasBorders: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
    hoverCursor: 'pointer',
    id: `measurement-${id}`,
    measurementId: id,
    measurementType: 'count',
    groupId,
    presetId,
  } as Record<string, unknown>);

  return group;
}

// ── Freehand Drawing ──

/**
 * Enable freehand drawing mode on the canvas.
 */
export function enableFreehandDraw(canvas: Canvas, color: string, width: number = 2): void {
  canvas.isDrawingMode = true;
  const brush = new PencilBrush(canvas);
  brush.color = color;
  brush.width = width;
  canvas.freeDrawingBrush = brush;
}

/**
 * Disable freehand drawing mode.
 */
export function disableFreehandDraw(canvas: Canvas): void {
  canvas.isDrawingMode = false;
}

// ── Annotation Objects ──

/**
 * Create a text annotation.
 */
export function createTextAnnotation(
  x: number,
  y: number,
  text: string,
  color: string,
  id: string
): Text {
  return new Text(text, {
    left: x,
    top: y,
    fontSize: 14,
    fill: color,
    fontFamily: 'sans-serif',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    padding: 6,
    editable: true,
    selectable: true,
    id: `annotation-${id}`,
    measurementType: 'annotation',
  } as Record<string, unknown>);
}

/**
 * Create a rectangle highlight annotation.
 */
export function createRectHighlight(
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  id: string
): Rect {
  return new Rect({
    left: x,
    top: y,
    width,
    height,
    fill: `${color}15`,
    stroke: color,
    strokeWidth: 2,
    selectable: true,
    id: `annotation-${id}`,
    measurementType: 'annotation',
  } as Record<string, unknown>);
}

/**
 * Create an arrow annotation (line with arrowhead).
 */
export function createArrowAnnotation(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  id: string,
  label?: string
): Group {
  const line = new Line([x1, y1, x2, y2], {
    stroke: color,
    strokeWidth: 2,
    selectable: false,
    evented: false,
  });

  // Arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 12;
  const arrowHead = new FabricPolyline(
    [
      { x: x2 - headLen * Math.cos(angle - Math.PI / 6), y: y2 - headLen * Math.sin(angle - Math.PI / 6) },
      { x: x2, y: y2 },
      { x: x2 - headLen * Math.cos(angle + Math.PI / 6), y: y2 - headLen * Math.sin(angle + Math.PI / 6) },
    ],
    {
      stroke: color,
      strokeWidth: 2,
      fill: 'transparent',
      selectable: false,
      evented: false,
    }
  );

  const objects: (Line | FabricPolyline | Text)[] = [line, arrowHead];

  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const textObj = new Text(label, {
      left: mx,
      top: my - 16,
      fontSize: 12,
      fill: color,
      fontFamily: 'sans-serif',
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      padding: 2,
      selectable: false,
      evented: false,
    });
    objects.push(textObj);
  }

  return new Group(objects, {
    selectable: true,
    evented: true,
    hasControls: false,
    hoverCursor: 'pointer',
    id: `annotation-${id}`,
    measurementType: 'annotation',
  } as Record<string, unknown>);
}

// Re-export fabric types that components will need
export type { Canvas, TPointerEvent, TPointerEventInfo };
export { Rect, Circle, Line, Text, Path, Group, FabricPolyline, FabricPolygon, PencilBrush };

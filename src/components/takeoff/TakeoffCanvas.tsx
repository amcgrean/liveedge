'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdf, renderPage } from '@/lib/takeoff/pdfLoader';
import {
  initFabricCanvas,
  resizeFabricCanvas,
  setCanvasZoom,
  panCanvas,
  serializeCanvas,
  restoreCanvas,
  clearCanvas,
  createMeasurementPolyline,
  createMeasurementPolygon,
  createCountMarker,
  createViewportRect,
  enableFreehandDraw,
  disableFreehandDraw,
  createTextAnnotation,
  createRectHighlight,
  createArrowAnnotation,
  createCloudAnnotation,
  Line,
  type Canvas,
} from '@/lib/takeoff/fabricHelpers';
import { calcPolylineLength, calcSegmentLengths, calcPolygonArea, formatMeasurement, pixelsPerUnitFromCalibration, calcPixelDistance } from '@/lib/takeoff/calculations';
import { findViewportAtPoint } from '@/lib/takeoff/viewportDetector';
import type { TakeoffState, TakeoffAction, ToolType } from '@/hooks/useMeasurementReducer';
import type { UndoableCommand } from '@/hooks/useUndoRedo';

interface TakeoffCanvasProps {
  state: TakeoffState;
  dispatch: React.Dispatch<TakeoffAction>;
  pushUndo: (command: UndoableCommand) => void;
  pdfData: ArrayBuffer | null;
  scrollMode: 'zoom' | 'pan';
  onObjectSelect: (objectId: string | null) => void;
  onCalibrationComplete: (viewportId: string, pixelsPerUnit: number) => void;
  onPdfLoaded?: (pdf: PDFDocumentProxy) => void;
}

export function TakeoffCanvas({
  state,
  dispatch,
  pushUndo,
  pdfData,
  scrollMode,
  onObjectSelect,
  onCalibrationComplete,
  onPdfLoaded,
}: TakeoffCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricInstanceRef = useRef<Canvas | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drawing state for polyline/polygon tools
  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const isDrawingRef = useRef(false);
  const tempObjectsRef = useRef<string[]>([]); // IDs of temporary drawing objects
  const previewLineRef = useRef<InstanceType<typeof Line> | null>(null);
  const previewSegmentsRef = useRef<InstanceType<typeof Line>[]>([]);

  // Calibration state
  const calibrationPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  // Pan state
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);
  const spaceHeldRef = useRef(false);

  // Stable refs used by the ResizeObserver (avoids effect re-registration on page change)
  const prevPageRef = useRef<number>(state.currentPage);
  const currentPageRef = useRef<number>(state.currentPage);
  const renderCurrentPageRef = useRef<(pageNum: number) => void>(() => {});

  // ── Initialize Fabric canvas ──
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = initFabricCanvas(fabricCanvasRef.current, 800, 600);
    fabricInstanceRef.current = canvas;

    // Object selection handler
    canvas.on('selection:created', (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        const measurementId = (obj as unknown as Record<string, unknown>).measurementId as string | undefined;
        onObjectSelect(measurementId ?? null);
      }
    });
    canvas.on('selection:cleared', () => {
      onObjectSelect(null);
    });

    return () => {
      canvas.dispose();
      fabricInstanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load PDF ──
  useEffect(() => {
    if (!pdfData) return;
    let cancelled = false;

    async function load() {
      try {
        const pdf = await loadPdf(pdfData!);
        if (cancelled) return;
        pdfDocRef.current = pdf;
        onPdfLoaded?.(pdf);
        dispatch({ type: 'INIT_SESSION', payload: { ...getSessionPayload(state), pageCount: pdf.numPages } });
        // Render first page
        await renderCurrentPage(1);
      } catch (err) {
        console.error('Failed to load PDF:', err);
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfData]);

  // Helper to get session init payload
  function getSessionPayload(s: TakeoffState) {
    return {
      sessionId: s.sessionId ?? '',
      sessionName: s.sessionName,
      bidId: s.bidId,
      pdfFileName: s.pdfFileName,
      pageCount: s.pageCount,
    };
  }

  // ── Render a PDF page ──
  const renderCurrentPage = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    const pdfCanvas = pdfCanvasRef.current;
    const fabricCanvas = fabricInstanceRef.current;
    if (!pdf || !pdfCanvas || !fabricCanvas) return;

    setIsRendering(true);

    try {
      const scale = 1.5; // Render at 1.5x for crisp display
      const { width, height } = await renderPage(pdf, pageNum, pdfCanvas, scale);

      // Match Fabric canvas to PDF canvas dimensions
      resizeFabricCanvas(fabricCanvas, width, height);

      // Restore saved Fabric state for this page if it exists
      const savedState = state.pageStates[pageNum];
      if (savedState) {
        await restoreCanvas(fabricCanvas, savedState as object);
      }

      // Render viewport rectangles
      const pageViewports = state.viewports[pageNum] ?? [];
      for (const vp of pageViewports) {
        const rect = createViewportRect(
          vp.id,
          `${vp.name} — ${vp.scaleName || 'Not calibrated'}`,
          vp.bounds.x,
          vp.bounds.y,
          vp.bounds.w,
          vp.bounds.h,
          vp.id === state.activeViewportId
        );
        fabricCanvas.add(rect);
        fabricCanvas.sendObjectToBack(rect);
      }
    } catch (err) {
      console.error('Failed to render page:', err);
    } finally {
      setIsRendering(false);
    }
  }, [state.pageStates, state.viewports, state.activeViewportId]);

  // Keep stable refs in sync so ResizeObserver never needs re-registration
  useEffect(() => { renderCurrentPageRef.current = renderCurrentPage; }, [renderCurrentPage]);
  useEffect(() => { currentPageRef.current = state.currentPage; }, [state.currentPage]);

  // ── Page navigation ──
  useEffect(() => {
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas || !pdfDocRef.current) return;

    // Save the PREVIOUS page's Fabric state before switching
    const currentFabricJson = serializeCanvas(fabricCanvas);
    dispatch({ type: 'SET_PAGE_STATE', payload: { pageNumber: prevPageRef.current, fabricJson: currentFabricJson } });
    prevPageRef.current = state.currentPage;

    // Clear and render new page
    clearCanvas(fabricCanvas);
    renderCurrentPage(state.currentPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPage]);

  // ── Zoom/scroll handler ──
  useEffect(() => {
    const container = containerRef.current;
    const pdfCanvasEl = pdfCanvasRef.current;
    const fabricCanvasEl = fabricCanvasRef.current;
    if (!container) return;

    function handleWheel(e: WheelEvent) {
      const fabricCanvas = fabricInstanceRef.current;
      const el = containerRef.current;
      if (!fabricCanvas || !el) return;

      if (scrollMode === 'zoom') {
        // Scroll always zooms (no modifier required). Ctrl+scroll also zooms.
        e.preventDefault();
        const delta = -e.deltaY / 500;
        const currentZoom = fabricCanvas.getZoom();
        const newZoom = Math.min(Math.max(currentZoom + delta, 0.1), 10);
        const rect = el.getBoundingClientRect();
        setCanvasZoom(fabricCanvas, newZoom, { x: e.clientX - rect.left, y: e.clientY - rect.top });
        dispatch({ type: 'SET_ZOOM', payload: newZoom });
      } else {
        // Pan mode: Ctrl+scroll still zooms; plain scroll pans the canvas
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = -e.deltaY / 500;
          const currentZoom = fabricCanvas.getZoom();
          const newZoom = Math.min(Math.max(currentZoom + delta, 0.1), 10);
          const rect = el.getBoundingClientRect();
          setCanvasZoom(fabricCanvas, newZoom, { x: e.clientX - rect.left, y: e.clientY - rect.top });
          dispatch({ type: 'SET_ZOOM', payload: newZoom });
        } else {
          // Pan canvas by scroll amount
          e.preventDefault();
          const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
          const dy = e.shiftKey ? 0 : -e.deltaY;
          panCanvas(fabricCanvas, dx, dy);
        }
      }
    }

    const opts: AddEventListenerOptions = { passive: false };
    container.addEventListener('wheel', handleWheel, opts);
    pdfCanvasEl?.addEventListener('wheel', handleWheel, opts);
    fabricCanvasEl?.addEventListener('wheel', handleWheel, opts);
    return () => {
      container.removeEventListener('wheel', handleWheel);
      pdfCanvasEl?.removeEventListener('wheel', handleWheel);
      fabricCanvasEl?.removeEventListener('wheel', handleWheel);
    };
  }, [dispatch, scrollMode]);

  // ── Keyboard handlers (space for pan, ctrl+z/y for undo/redo) ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !spaceHeldRef.current) {
        spaceHeldRef.current = true;
        if (containerRef.current) containerRef.current.style.cursor = 'grab';
      }
      if (e.code === 'Escape') {
        // Cancel current drawing
        isDrawingRef.current = false;
        drawingPointsRef.current = [];
        calibrationPointsRef.current = [];
        // Clean up preview lines
        const fc = fabricInstanceRef.current;
        if (fc) {
          if (previewLineRef.current) {
            fc.remove(previewLineRef.current);
            previewLineRef.current = null;
          }
          for (const seg of previewSegmentsRef.current) {
            fc.remove(seg);
          }
          previewSegmentsRef.current = [];
          fc.renderAll();
        }
        dispatch({ type: 'SET_TOOL', payload: 'select' });
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        isPanningRef.current = false;
        if (containerRef.current) containerRef.current.style.cursor = 'default';
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [dispatch]);

  // ── Canvas click handler (tool interactions) ──
  useEffect(() => {
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas) return;

    function handleMouseDown(opt: { e: MouseEvent; scenePoint: { x: number; y: number } }) {
      const pointer = opt.scenePoint;
      const e = opt.e;

      // Pan mode
      if (spaceHeldRef.current || e.button === 1) {
        isPanningRef.current = true;
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Auto-detect viewport
      const pageViewports = state.viewports[state.currentPage] ?? [];
      const vpBounds = pageViewports.map((vp) => ({ id: vp.id, ...vp.bounds }));
      const detectedVp = findViewportAtPoint(vpBounds, pointer.x, pointer.y);
      if (detectedVp && detectedVp !== state.activeViewportId) {
        dispatch({ type: 'SET_ACTIVE_VIEWPORT', payload: detectedVp });
      }

      const tool = state.activeTool;

      if (tool === 'polyline' || tool === 'polygon') {
        drawingPointsRef.current.push({ x: pointer.x, y: pointer.y });
        isDrawingRef.current = true;

        // Draw confirmed segment for points after the first
        const pts = drawingPointsRef.current;
        if (pts.length >= 2) {
          const fc = fabricInstanceRef.current;
          const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
          const color = activeGroup?.color ?? '#22d3ee';
          if (fc) {
            const prev = pts[pts.length - 2];
            const curr = pts[pts.length - 1];
            const seg = new Line([prev.x, prev.y, curr.x, curr.y], {
              stroke: color,
              strokeWidth: 2,
              selectable: false,
              evented: false,
            });
            fc.add(seg);
            previewSegmentsRef.current.push(seg);
          }
        }
      } else if (tool === 'count' && state.activePresetId) {
        handleCountPlacement(pointer.x, pointer.y);
      } else if (tool === 'calibrate') {
        calibrationPointsRef.current.push({ x: pointer.x, y: pointer.y });
        if (calibrationPointsRef.current.length === 2) {
          handleCalibrationComplete();
        }
      } else if (tool === 'viewport') {
        // Start viewport rectangle draw
        drawingPointsRef.current = [{ x: pointer.x, y: pointer.y }];
        isDrawingRef.current = true;
      } else if (tool === 'text') {
        handleTextPlacement(pointer.x, pointer.y);
      } else if (tool === 'arrow') {
        drawingPointsRef.current.push({ x: pointer.x, y: pointer.y });
        isDrawingRef.current = true;
      } else if (tool === 'rectangle') {
        drawingPointsRef.current = [{ x: pointer.x, y: pointer.y }];
        isDrawingRef.current = true;
      } else if (tool === 'cloud' && isDrawingRef.current && drawingPointsRef.current.length >= 1) {
        handleCloudComplete(pointer.x, pointer.y);
      } else if (tool === 'cloud') {
        drawingPointsRef.current = [{ x: pointer.x, y: pointer.y }];
        isDrawingRef.current = true;
      }
    }

    function handleMouseMove(opt: { e: MouseEvent; scenePoint: { x: number; y: number } }) {
      // Pan
      if (isPanningRef.current && lastPanPointRef.current && fabricCanvas) {
        const dx = opt.e.clientX - lastPanPointRef.current.x;
        const dy = opt.e.clientY - lastPanPointRef.current.y;
        panCanvas(fabricCanvas, dx, dy);
        lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY };
      }

      // Rubber-band preview for polyline/polygon
      if (isDrawingRef.current && drawingPointsRef.current.length > 0) {
        const tool = state.activeTool;
        if (tool === 'polyline' || tool === 'polygon') {
          const fc = fabricInstanceRef.current;
          if (fc) {
            if (previewLineRef.current) {
              fc.remove(previewLineRef.current);
            }
            const lastPt = drawingPointsRef.current[drawingPointsRef.current.length - 1];
            const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
            const color = activeGroup?.color ?? '#22d3ee';
            const preview = new Line(
              [lastPt.x, lastPt.y, opt.scenePoint.x, opt.scenePoint.y],
              {
                stroke: color,
                strokeWidth: 2,
                strokeDashArray: [6, 3],
                selectable: false,
                evented: false,
                opacity: 0.6,
              }
            );
            fc.add(preview);
            fc.renderAll();
            previewLineRef.current = preview;
          }
        }
      }
    }

    function handleMouseUp() {
      isPanningRef.current = false;
      lastPanPointRef.current = null;

      const tool = state.activeTool;

      // Viewport rectangle completion
      if (tool === 'viewport' && isDrawingRef.current && drawingPointsRef.current.length >= 1) {
        // We'll handle this in dblclick for now — viewport needs drag
      }

      // Arrow completion (2 points)
      if (tool === 'arrow' && drawingPointsRef.current.length >= 2) {
        handleArrowComplete();
      }

      // Rectangle completion
      if (tool === 'rectangle' && isDrawingRef.current && drawingPointsRef.current.length >= 1) {
        // Gets completed on second click
      }
    }

    function handleDblClick(opt: { scenePoint: { x: number; y: number } }) {
      const tool = state.activeTool;

      if (tool === 'polyline' && drawingPointsRef.current.length >= 2) {
        handlePolylineComplete();
      } else if (tool === 'polygon' && drawingPointsRef.current.length >= 3) {
        handlePolygonComplete();
      }
    }

    function handleMouseOver(opt: { e: MouseEvent; target?: unknown }) {
      const target = opt.target as Record<string, unknown> | undefined;
      if (!target) return;

      const measId = target.measurementId as string | undefined;
      const gId = target.groupId as string | undefined;
      if (!measId || !gId) return;

      // Clear any existing timer
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);

      tooltipTimerRef.current = setTimeout(() => {
        const group = state.groups.find((g) => g.id === gId);
        if (!group) return;

        // Find the measurement value
        const pageMeasurements = state.measurements[state.currentPage] ?? [];
        const measurement = pageMeasurements.find((m) => m.id === measId);
        const valueText = measurement ? `${measurement.label}` : '';

        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        setTooltip({
          x: opt.e.clientX - rect.left,
          y: opt.e.clientY - rect.top - 40,
          text: `${group.name}${valueText ? ': ' + valueText : ''}`,
        });
      }, 300);
    }

    function handleMouseOut() {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      setTooltip(null);
    }

    // Register events
    fabricCanvas.on('mouse:down', handleMouseDown as unknown as (...args: unknown[]) => void);
    fabricCanvas.on('mouse:move', handleMouseMove as unknown as (...args: unknown[]) => void);
    fabricCanvas.on('mouse:up', handleMouseUp as unknown as (...args: unknown[]) => void);
    fabricCanvas.on('mouse:dblclick', handleDblClick as unknown as (...args: unknown[]) => void);
    fabricCanvas.on('mouse:over', handleMouseOver as unknown as (...args: unknown[]) => void);
    fabricCanvas.on('mouse:out', handleMouseOut as unknown as (...args: unknown[]) => void);

    return () => {
      fabricCanvas.off('mouse:down');
      fabricCanvas.off('mouse:move');
      fabricCanvas.off('mouse:up');
      fabricCanvas.off('mouse:dblclick');
      fabricCanvas.off('mouse:over');
      fabricCanvas.off('mouse:out');
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeTool, state.activePresetId, state.activeViewportId, state.currentPage, state.viewports, state.groups, state.measurements]);

  // ── Freehand mode toggle ──
  useEffect(() => {
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas) return;
    const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
    if (state.activeTool === 'freehand') {
      enableFreehandDraw(fabricCanvas, activeGroup?.color ?? '#22d3ee');
    } else {
      disableFreehandDraw(fabricCanvas);
    }
  }, [state.activeTool, state.activePresetId, state.groups]);

  // ── Tool completion handlers ──

  function cleanupPreview() {
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas) return;
    if (previewLineRef.current) {
      fabricCanvas.remove(previewLineRef.current);
      previewLineRef.current = null;
    }
    for (const seg of previewSegmentsRef.current) {
      fabricCanvas.remove(seg);
    }
    previewSegmentsRef.current = [];
  }

  function handlePolylineComplete() {
    cleanupPreview();
    const points = [...drawingPointsRef.current];
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas || points.length < 2 || !state.activePresetId) return;

    const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
    if (!activeGroup) return;

    // Get viewport calibration
    const activeVp = (state.viewports[state.currentPage] ?? []).find((v) => v.id === state.activeViewportId);
    const ppu = activeVp?.pixelsPerUnit || 1;

    const totalLength = calcPolylineLength(points, ppu);
    const segLengths = calcSegmentLengths(points, ppu);

    const measId = crypto.randomUUID();
    const segLabels = segLengths.map((l) => formatMeasurement(l, activeGroup.unit));
    const totalLabel = formatMeasurement(totalLength, activeGroup.unit);

    const fabricObj = createMeasurementPolyline(
      points, activeGroup.color, segLabels, totalLabel,
      measId, activeGroup.id, state.activePresetId
    );

    fabricCanvas.add(fabricObj);
    fabricCanvas.renderAll();

    // Dispatch measurement
    const measurement = {
      id: measId,
      groupId: activeGroup.id,
      pageNumber: state.currentPage,
      viewportId: state.activeViewportId,
      type: 'polyline' as const,
      geometry: points,
      calculatedValue: totalLength,
      unit: activeGroup.unit,
      label: totalLabel,
      notes: '',
      createdAt: new Date().toISOString(),
    };

    // Undo support
    pushUndo({
      type: 'ADD_MEASUREMENT',
      description: `Add ${activeGroup.name} ${totalLabel}`,
      execute: () => {
        dispatch({ type: 'ADD_MEASUREMENT', payload: measurement });
        // Recalc group total
        recalcGroupTotal(activeGroup.id);
      },
      undo: () => {
        dispatch({ type: 'DELETE_MEASUREMENT', payload: { id: measId, pageNumber: state.currentPage, groupId: activeGroup.id } });
        fabricCanvas.remove(fabricObj);
        fabricCanvas.renderAll();
        recalcGroupTotal(activeGroup.id);
      },
    });

    // Reset drawing state
    drawingPointsRef.current = [];
    isDrawingRef.current = false;
  }

  function handlePolygonComplete() {
    cleanupPreview();
    const points = [...drawingPointsRef.current];
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas || points.length < 3 || !state.activePresetId) return;

    const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
    if (!activeGroup) return;

    const activeVp = (state.viewports[state.currentPage] ?? []).find((v) => v.id === state.activeViewportId);
    const ppu = activeVp?.pixelsPerUnit || 1;

    const area = calcPolygonArea(points, ppu);
    const measId = crypto.randomUUID();
    const areaLabel = formatMeasurement(area, activeGroup.unit);

    const fabricObj = createMeasurementPolygon(
      points, activeGroup.color, areaLabel,
      measId, activeGroup.id, state.activePresetId
    );

    fabricCanvas.add(fabricObj);
    fabricCanvas.renderAll();

    const measurement = {
      id: measId,
      groupId: activeGroup.id,
      pageNumber: state.currentPage,
      viewportId: state.activeViewportId,
      type: 'polygon' as const,
      geometry: points,
      calculatedValue: area,
      unit: activeGroup.unit,
      label: areaLabel,
      notes: '',
      createdAt: new Date().toISOString(),
    };

    pushUndo({
      type: 'ADD_MEASUREMENT',
      description: `Add ${activeGroup.name} ${areaLabel}`,
      execute: () => {
        dispatch({ type: 'ADD_MEASUREMENT', payload: measurement });
        recalcGroupTotal(activeGroup.id);
      },
      undo: () => {
        dispatch({ type: 'DELETE_MEASUREMENT', payload: { id: measId, pageNumber: state.currentPage, groupId: activeGroup.id } });
        fabricCanvas.remove(fabricObj);
        fabricCanvas.renderAll();
        recalcGroupTotal(activeGroup.id);
      },
    });

    drawingPointsRef.current = [];
    isDrawingRef.current = false;
  }

  function handleCountPlacement(x: number, y: number) {
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas || !state.activePresetId) return;

    const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
    if (!activeGroup) return;

    // Count existing markers in this group on this page
    const pageMeasurements = state.measurements[state.currentPage] ?? [];
    const groupCount = pageMeasurements.filter((m) => m.groupId === activeGroup.id && m.type === 'count').length;

    const measId = crypto.randomUUID();
    const markerNum = groupCount + 1;

    const fabricObj = createCountMarker(
      x, y, markerNum, activeGroup.color,
      measId, activeGroup.id, state.activePresetId
    );

    fabricCanvas.add(fabricObj);
    fabricCanvas.renderAll();

    const measurement = {
      id: measId,
      groupId: activeGroup.id,
      pageNumber: state.currentPage,
      viewportId: state.activeViewportId,
      type: 'count' as const,
      geometry: { x, y },
      calculatedValue: 1,
      unit: 'EA',
      label: `#${markerNum}`,
      notes: '',
      createdAt: new Date().toISOString(),
    };

    pushUndo({
      type: 'ADD_MEASUREMENT',
      description: `Add ${activeGroup.name} #${markerNum}`,
      execute: () => {
        dispatch({ type: 'ADD_MEASUREMENT', payload: measurement });
        recalcGroupTotal(activeGroup.id);
      },
      undo: () => {
        dispatch({ type: 'DELETE_MEASUREMENT', payload: { id: measId, pageNumber: state.currentPage, groupId: activeGroup.id } });
        fabricCanvas.remove(fabricObj);
        fabricCanvas.renderAll();
        recalcGroupTotal(activeGroup.id);
      },
    });
  }

  function handleCalibrationComplete() {
    const [p1, p2] = calibrationPointsRef.current;
    if (!p1 || !p2 || !state.activeViewportId) return;

    const distance = calcPixelDistance(p1, p2);
    // Prompt user for real-world distance
    const input = window.prompt('Enter the real-world distance (in feet):');
    if (!input) {
      calibrationPointsRef.current = [];
      return;
    }

    const realDist = parseFloat(input);
    if (isNaN(realDist) || realDist <= 0) {
      calibrationPointsRef.current = [];
      return;
    }

    const ppu = pixelsPerUnitFromCalibration(p1, p2, realDist);
    onCalibrationComplete(state.activeViewportId, ppu);

    calibrationPointsRef.current = [];
    dispatch({ type: 'SET_TOOL', payload: 'select' });
  }

  function handleTextPlacement(x: number, y: number) {
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas) return;

    const text = window.prompt('Enter text:');
    if (!text) return;

    const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
    const color = activeGroup?.color ?? '#22d3ee';
    const id = crypto.randomUUID();

    const textObj = createTextAnnotation(x, y, text, color, id);
    fabricCanvas.add(textObj);
    fabricCanvas.renderAll();
  }

  function handleArrowComplete() {
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas || drawingPointsRef.current.length < 2) return;

    const [p1, p2] = drawingPointsRef.current;
    const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
    const color = activeGroup?.color ?? '#22d3ee';
    const id = crypto.randomUUID();

    const arrow = createArrowAnnotation(p1.x, p1.y, p2.x, p2.y, color, id);
    fabricCanvas.add(arrow);
    fabricCanvas.renderAll();

    drawingPointsRef.current = [];
    isDrawingRef.current = false;
  }

  function handleCloudComplete(x2: number, y2: number) {
    const fabricCanvas = fabricInstanceRef.current;
    if (!fabricCanvas || drawingPointsRef.current.length < 1) return;

    const { x: x1, y: y1 } = drawingPointsRef.current[0];
    const activeGroup = state.groups.find((g) => g.id === state.activePresetId);
    const color = activeGroup?.color ?? '#22d3ee';
    const id = crypto.randomUUID();

    const cloud = createCloudAnnotation(x1, y1, x2, y2, color, id);
    fabricCanvas.add(cloud);
    fabricCanvas.renderAll();

    drawingPointsRef.current = [];
    isDrawingRef.current = false;
  }

  function recalcGroupTotal(groupId: string) {
    let total = 0;
    for (const pageMeasurements of Object.values(state.measurements)) {
      for (const m of pageMeasurements) {
        if (m.groupId === groupId) {
          total += m.calculatedValue;
        }
      }
    }
    dispatch({ type: 'UPDATE_GROUP_TOTAL', payload: { id: groupId, total } });
  }

  // ── ResizeObserver ──
  // Uses stable refs so the observer is registered once and never re-registers on page
  // change (which would fire an immediate callback and cancel the in-progress render).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let debounceTimer: ReturnType<typeof setTimeout>;

    const observer = new ResizeObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderCurrentPageRef.current(currentPageRef.current);
      }, 200);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      clearTimeout(debounceTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-slate-950"
      style={{ cursor: spaceHeldRef.current ? 'grab' : 'default' }}
    >
      {/* Loading overlay */}
      {isRendering && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400">Rendering page...</span>
          </div>
        </div>
      )}

      {/* PDF canvas (bottom layer) */}
      <canvas
        ref={pdfCanvasRef}
        className="absolute inset-0"
        style={{ zIndex: 1 }}
      />

      {/* Fabric.js canvas (top layer) */}
      <canvas
        ref={fabricCanvasRef}
        className="absolute inset-0"
        style={{ zIndex: 2 }}
      />

      {/* Drawing instruction overlay */}
      {isDrawingRef.current && state.activeTool === 'polyline' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-sm text-slate-300">
          Click to add points. Double-click to finish.
        </div>
      )}
      {isDrawingRef.current && state.activeTool === 'polygon' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-sm text-slate-300">
          Click to add vertices. Double-click to close polygon.
        </div>
      )}
      {state.activeTool === 'calibrate' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-sm text-slate-300">
          {calibrationPointsRef.current.length === 0
            ? 'Click the first calibration point'
            : 'Click the second calibration point'}
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="absolute z-30 px-2.5 py-1.5 rounded-md bg-slate-900/95 border border-white/10 text-xs text-slate-200 pointer-events-none whitespace-nowrap shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

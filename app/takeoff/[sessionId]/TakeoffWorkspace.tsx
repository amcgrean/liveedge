'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TakeoffCanvas } from '@/components/takeoff/TakeoffCanvas';
import { TakeoffToolbar } from '@/components/takeoff/TakeoffToolbar';
import { PageNavigator } from '@/components/takeoff/PageNavigator';
import { MeasurementSidebar } from '@/components/takeoff/MeasurementSidebar';
import { MeasurementInspector } from '@/components/takeoff/MeasurementInspector';
import { ViewportManager } from '@/components/takeoff/ViewportManager';
import { ScaleCalibration } from '@/components/takeoff/ScaleCalibration';
import { useMeasurementReducer } from '@/hooks/useMeasurementReducer';
import { useTakeoffSession } from '@/hooks/useTakeoffSession';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { exportMeasurementsCsv } from '@/lib/takeoff/exportCsv';
import { BottomBar } from '@/components/takeoff/BottomBar';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface Props {
  sessionId: string;
}

export function TakeoffWorkspace({ sessionId }: Props) {
  const [state, dispatch] = useMeasurementReducer();
  const { loadSession, saveSession, triggerAutoSave } = useTakeoffSession({ state, dispatch });
  const { push: pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo();
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [showCalibration, setShowCalibration] = useState<string | null>(null); // viewport ID
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [scrollMode, setScrollMode] = useState<'zoom' | 'pan'>('zoom');
  const [showThumbnails, setShowThumbnails] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load session on mount
  useEffect(() => {
    loadSession(sessionId);
  }, [sessionId, loadSession]);

  // Handle PDF file upload/load
  const handlePdfLoad = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    setPdfData(buffer);

    // Upload to R2 — try presigned URL first (bypasses Vercel 4.5MB limit),
    // fall back to server-side proxy for smaller files
    try {
      let uploaded = false;

      // Attempt 1: presigned URL (direct browser → R2)
      try {
        const presignRes = await fetch(
          `/api/takeoff/sessions/${sessionId}/upload?fileName=${encodeURIComponent(file.name)}`
        );
        if (presignRes.ok) {
          const { uploadUrl, storageKey } = await presignRes.json();
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': 'application/pdf' },
          });
          if (uploadRes.ok) {
            // Confirm upload and update session record
            await fetch(`/api/takeoff/sessions/${sessionId}/upload`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: file.name, storageKey }),
            });
            uploaded = true;
          }
        }
      } catch {
        // Presigned upload failed (CORS, network, etc.) — try fallback
      }

      // Attempt 2: server-side proxy (works for files under ~4MB)
      if (!uploaded) {
        const formData = new FormData();
        formData.append('pdf', file);
        const res = await fetch(`/api/takeoff/sessions/${sessionId}/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          console.error('PDF upload failed:', await res.text());
        }
      }
    } catch (err) {
      console.error('PDF upload failed:', err);
    }

    // Update session with page count (done via canvas component after PDF loads)
    dispatch({
      type: 'INIT_SESSION',
      payload: {
        sessionId,
        sessionName: state.sessionName || file.name.replace('.pdf', ''),
        bidId: state.bidId,
        pdfFileName: file.name,
        pageCount: 0, // Will be updated by TakeoffCanvas
      },
    });
  }, [sessionId, state.sessionName, state.bidId, dispatch]);

  // Load PDF from R2 if session has a stored PDF
  useEffect(() => {
    if (pdfData || !state.sessionId) return;

    async function loadFromR2() {
      try {
        const res = await fetch(`/api/takeoff/sessions/${sessionId}/pdf?mode=download`);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          setPdfData(buffer);
          return;
        }
      } catch (err) {
        console.warn('No stored PDF found, showing upload prompt:', err);
      }
      // No stored PDF — show upload prompt
      setShowFileUpload(true);
    }

    // Wait for session data to load before trying R2
    if (!state.isLoading) {
      loadFromR2();
    }
  }, [sessionId, state.sessionId, state.isLoading, pdfData]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveSession();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, saveSession]);

  // Object selection for inspector
  const [selectedMeasurement, setSelectedMeasurement] = useState<string | null>(null);

  const handleObjectSelect = useCallback((objectId: string | null) => {
    dispatch({ type: 'SELECT_OBJECT', payload: objectId });
    setSelectedMeasurement(objectId);
  }, [dispatch]);

  // Find selected measurement data
  const selectedMeasurementData = selectedMeasurement
    ? Object.values(state.measurements).flat().find((m) => m.id === selectedMeasurement)
    : null;
  const selectedGroup = selectedMeasurementData
    ? state.groups.find((g) => g.id === selectedMeasurementData.groupId)
    : null;
  const selectedViewport = selectedMeasurementData?.viewportId
    ? Object.values(state.viewports).flat().find((v) => v.id === selectedMeasurementData.viewportId)
    : null;

  // Calibration
  const handleCalibrationComplete = useCallback((viewportId: string, pixelsPerUnit: number) => {
    const vp = Object.values(state.viewports).flat().find((v) => v.id === viewportId);
    if (!vp) return;

    dispatch({
      type: 'CALIBRATE_VIEWPORT',
      payload: {
        id: viewportId,
        pageNumber: vp.pageNumber,
        pixelsPerUnit,
        scaleName: `Custom (${pixelsPerUnit.toFixed(1)} px/ft)`,
        scalePreset: null,
      },
    });
  }, [state.viewports, dispatch]);

  // Scale preset application
  const handleApplyScalePreset = useCallback((scaleName: string, pixelsPerUnit: number, presetKey: string) => {
    if (!showCalibration) return;
    const vp = Object.values(state.viewports).flat().find((v) => v.id === showCalibration);
    if (!vp) return;

    dispatch({
      type: 'CALIBRATE_VIEWPORT',
      payload: {
        id: showCalibration,
        pageNumber: vp.pageNumber,
        pixelsPerUnit,
        scaleName,
        scalePreset: presetKey,
      },
    });
    setShowCalibration(null);
  }, [showCalibration, state.viewports, dispatch]);

  // Active viewport scale
  const activeVp = state.activeViewportId
    ? (state.viewports[state.currentPage] ?? []).find((v) => v.id === state.activeViewportId)
    : null;

  // Custom group creation
  const handleAddCustomGroup = useCallback(() => {
    const name = window.prompt('Group name:');
    if (!name) return;
    const typeInput = window.prompt('Type (linear, area, count):');
    if (!typeInput || !['linear', 'area', 'count'].includes(typeInput)) return;

    const type = typeInput as 'linear' | 'area' | 'count';
    const unit = type === 'linear' ? 'LF' : type === 'area' ? 'SF' : 'EA';
    const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

    dispatch({
      type: 'ADD_GROUP',
      payload: {
        id: crypto.randomUUID(),
        name,
        color,
        type,
        unit,
        sortOrder: state.groups.length,
        targetField: null,
        isPreset: false,
        category: 'Custom',
        assemblyId: null,
        runningTotal: 0,
      },
    });
  }, [state.groups.length, dispatch]);

  // Export
  const handleExport = useCallback((type: 'csv' | 'pdf') => {
    if (type === 'csv') {
      exportMeasurementsCsv(state.groups, state.measurements, state.sessionName);
    }
    // PDF export would go here
  }, [state.groups, state.measurements, state.sessionName]);

  // Send to estimate
  const handleSendToEstimate = useCallback(async () => {
    if (!state.sessionId) return;
    const confirm = window.confirm(
      'This will update the linked bid with all measurement totals. Continue?'
    );
    if (!confirm) return;

    try {
      const res = await fetch(`/api/takeoff/sessions/${state.sessionId}/send-to-estimate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to send to estimate');
      const data = await res.json();
      window.alert(`Updated ${data.updatedFields?.length ?? 0} fields on the estimate.`);
    } catch (err) {
      console.error('Send to estimate failed:', err);
      window.alert('Failed to send to estimate. See console for details.');
    }
  }, [state.sessionId]);

  // Loading state
  if (state.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* File upload prompt */}
      {showFileUpload && !pdfData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">Load PDF Plan Set</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handlePdfLoad(file);
                  setShowFileUpload(false);
                }
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-slate-400 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-cyan-500/20 file:text-cyan-400 file:cursor-pointer"
            />
            <p className="text-xs text-slate-600 mt-3">
              Select the PDF construction plan set for this takeoff session.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <TakeoffToolbar
        sessionName={state.sessionName}
        activeTool={state.activeTool}
        activeViewportScale={activeVp?.scaleName ?? null}
        isDirty={state.isDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        onSetTool={(tool) => dispatch({ type: 'SET_TOOL', payload: tool })}
        onSave={saveSession}
        onExport={handleExport}
        onSendToEstimate={handleSendToEstimate}
        onUndo={undo}
        onRedo={redo}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Canvas row */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas column */}
          <div className="flex-1 relative overflow-hidden">
            <TakeoffCanvas
              state={state}
              dispatch={dispatch}
              pushUndo={pushUndo}
              pdfData={pdfData}
              scrollMode={scrollMode}
              onObjectSelect={handleObjectSelect}
              onCalibrationComplete={handleCalibrationComplete}
            />

            {/* Inspector panel (absolute overlay) */}
            <MeasurementInspector
              measurement={selectedMeasurementData ?? null}
              group={selectedGroup ?? null}
              viewport={selectedViewport ?? null}
              onClose={() => handleObjectSelect(null)}
              onDelete={(id, page, groupId) => {
                dispatch({ type: 'DELETE_MEASUREMENT', payload: { id, pageNumber: page, groupId } });
                handleObjectSelect(null);
              }}
              onUpdateNotes={(id, page, notes) => {
                dispatch({ type: 'UPDATE_MEASUREMENT', payload: { id, pageNumber: page, updates: { notes } } });
              }}
            />
          </div>

          {/* Right sidebar */}
          <div className="flex flex-col border-l border-white/10">
            {/* Viewport manager */}
            <div className="border-b border-white/10">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Viewports
              </div>
              <ViewportManager
                viewports={state.viewports[state.currentPage] ?? []}
                activeViewportId={state.activeViewportId}
                onSelectViewport={(id) => dispatch({ type: 'SET_ACTIVE_VIEWPORT', payload: id })}
                onCalibrateViewport={(id) => setShowCalibration(id)}
                onDeleteViewport={(id, page) => dispatch({ type: 'DELETE_VIEWPORT', payload: { id, pageNumber: page } })}
              />
            </div>

            {/* Measurement sidebar */}
            <MeasurementSidebar
              groups={state.groups}
              activePresetId={state.activePresetId}
              sessionName={state.sessionName}
              onSelectPreset={(id) => dispatch({ type: 'SET_ACTIVE_PRESET', payload: id })}
              onHighlightGroup={() => {}}
              onAddCustomGroup={handleAddCustomGroup}
            />
          </div>
        </div>

        {/* Page thumbnail strip (collapsible) */}
        {showThumbnails && (
          <PageNavigator
            pdf={pdfDoc}
            currentPage={state.currentPage}
            pageCount={state.pageCount}
            onPageChange={(page) => dispatch({ type: 'SET_PAGE', payload: page })}
          />
        )}

        {/* Bottom bar */}
        <BottomBar
          currentPage={state.currentPage}
          pageCount={state.pageCount}
          zoom={state.zoom}
          scrollMode={scrollMode}
          showThumbnails={showThumbnails}
          onPageChange={(page) => dispatch({ type: 'SET_PAGE', payload: page })}
          onZoomChange={(zoom) => dispatch({ type: 'SET_ZOOM', payload: zoom })}
          onToggleScrollMode={() => setScrollMode((m) => m === 'zoom' ? 'pan' : 'zoom')}
          onToggleThumbnails={() => setShowThumbnails((v) => !v)}
        />
      </div>

      {/* Scale calibration modal */}
      {showCalibration && (
        <ScaleCalibration
          viewportName={
            Object.values(state.viewports).flat().find((v) => v.id === showCalibration)?.name ?? ''
          }
          onApplyPreset={handleApplyScalePreset}
          onStartManualCalibration={() => {
            setShowCalibration(null);
            dispatch({ type: 'SET_TOOL', payload: 'calibrate' });
          }}
          onClose={() => setShowCalibration(null)}
        />
      )}
    </div>
  );
}

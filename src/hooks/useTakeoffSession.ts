import { useCallback, useEffect, useRef } from 'react';
import type { TakeoffState, TakeoffAction, GroupState, ViewportState, MeasurementState } from './useMeasurementReducer';

interface UseTakeoffSessionOpts {
  state: TakeoffState;
  dispatch: React.Dispatch<TakeoffAction>;
}

export function useTakeoffSession({ state, dispatch }: UseTakeoffSessionOpts) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');

  // ── Load session from API ──
  const loadSession = useCallback(
    async (sessionId: string) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const res = await fetch(`/api/takeoff/sessions/${sessionId}`);
        if (!res.ok) throw new Error('Failed to load session');
        const data = await res.json();

        dispatch({
          type: 'INIT_SESSION',
          payload: {
            sessionId: data.session.id,
            sessionName: data.session.name,
            bidId: data.session.bidId,
            pdfFileName: data.session.pdfFileName,
            pageCount: data.session.pageCount,
          },
        });

        // Organize viewports by page
        const viewportsByPage: Record<number, ViewportState[]> = {};
        for (const vp of data.viewports ?? []) {
          const page = vp.pageNumber;
          if (!viewportsByPage[page]) viewportsByPage[page] = [];
          viewportsByPage[page].push({
            id: vp.id,
            name: vp.name,
            pageNumber: vp.pageNumber,
            bounds: vp.bounds as { x: number; y: number; w: number; h: number },
            pixelsPerUnit: Number(vp.pixelsPerUnit) || 0,
            unit: vp.unit,
            scaleName: vp.scaleName ?? '',
            scalePreset: vp.scalePreset,
          });
        }

        // Map groups
        const groups: GroupState[] = (data.groups ?? []).map((g: Record<string, unknown>) => ({
          id: g.id as string,
          name: g.name as string,
          color: g.color as string,
          type: g.type as 'linear' | 'area' | 'count',
          unit: g.unit as string,
          sortOrder: g.sortOrder as number,
          targetField: g.targetField as string | null,
          isPreset: g.isPreset as boolean,
          category: g.category as string | null,
          assemblyId: g.assemblyId as string | null,
          runningTotal: 0,
        }));

        // Organize measurements by page
        const measurementsByPage: Record<number, MeasurementState[]> = {};
        for (const m of data.measurements ?? []) {
          const page = m.pageNumber;
          if (!measurementsByPage[page]) measurementsByPage[page] = [];
          measurementsByPage[page].push({
            id: m.id,
            groupId: m.groupId,
            pageNumber: m.pageNumber,
            viewportId: m.viewportId,
            type: m.type,
            geometry: m.geometry,
            calculatedValue: Number(m.calculatedValue) || 0,
            unit: m.unit ?? '',
            label: m.label ?? '',
            notes: m.notes ?? '',
            createdAt: m.createdAt,
          });
        }

        // Organize page states
        const pageStates: Record<number, unknown> = {};
        for (const ps of data.pageStates ?? []) {
          pageStates[ps.pageNumber] = ps.fabricJson;
        }

        dispatch({
          type: 'LOAD_SESSION_DATA',
          payload: { viewports: viewportsByPage, groups, measurements: measurementsByPage, pageStates },
        });

        // Calculate running totals
        for (const g of groups) {
          let total = 0;
          for (const pageMeasurements of Object.values(measurementsByPage)) {
            for (const m of pageMeasurements) {
              if (m.groupId === g.id) {
                total += m.calculatedValue;
              }
            }
          }
          dispatch({ type: 'UPDATE_GROUP_TOTAL', payload: { id: g.id, total } });
        }
      } catch (err) {
        console.error('Failed to load takeoff session:', err);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    [dispatch]
  );

  // ── Auto-save (debounced 2 seconds) ──
  const savePageState = useCallback(
    async (sessionId: string, pageNumber: number, fabricJson: unknown) => {
      try {
        await fetch(`/api/takeoff/sessions/${sessionId}/pages`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageNumber, fabricJson }),
        });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    },
    []
  );

  const triggerAutoSave = useCallback(() => {
    if (!state.sessionId || !state.isDirty) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const currentPageState = state.pageStates[state.currentPage];
      if (currentPageState && state.sessionId) {
        const stateKey = JSON.stringify({ page: state.currentPage, state: currentPageState });
        if (stateKey !== lastSavedRef.current) {
          lastSavedRef.current = stateKey;
          savePageState(state.sessionId, state.currentPage, currentPageState);
          dispatch({ type: 'MARK_CLEAN' });
        }
      }
    }, 2000);
  }, [state.sessionId, state.isDirty, state.currentPage, state.pageStates, savePageState, dispatch]);

  // Trigger auto-save when state becomes dirty
  useEffect(() => {
    if (state.isDirty) {
      triggerAutoSave();
    }
  }, [state.isDirty, triggerAutoSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // ── Save full session ──
  const saveSession = useCallback(async () => {
    if (!state.sessionId) return;

    try {
      // Save all viewports
      for (const [page, vps] of Object.entries(state.viewports)) {
        for (const vp of vps) {
          await fetch(`/api/takeoff/sessions/${state.sessionId}/viewports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...vp, pageNumber: Number(page) }),
          });
        }
      }

      // Save all page states
      for (const [page, fabricJson] of Object.entries(state.pageStates)) {
        await savePageState(state.sessionId, Number(page), fabricJson);
      }

      dispatch({ type: 'MARK_CLEAN' });
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, [state.sessionId, state.viewports, state.pageStates, savePageState, dispatch]);

  // ── Create new session ──
  const createSession = useCallback(
    async (bidId: string | null, name: string, pdfFileName: string, pageCount: number) => {
      try {
        const res = await fetch('/api/takeoff/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bidId, name, pdfFileName, pageCount }),
        });
        if (!res.ok) throw new Error('Failed to create session');
        const data = await res.json();
        return data.session.id as string;
      } catch (err) {
        console.error('Failed to create session:', err);
        return null;
      }
    },
    []
  );

  return {
    loadSession,
    saveSession,
    createSession,
    triggerAutoSave,
  };
}

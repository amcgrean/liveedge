import { useReducer } from 'react';
import type { MeasurementPreset } from '@/lib/takeoff/presets';

// ── Types ──

export type ToolType =
  | 'select'
  | 'viewport'
  | 'polyline'
  | 'polygon'
  | 'count'
  | 'text'
  | 'arrow'
  | 'rectangle'
  | 'cloud'
  | 'stamp'
  | 'freehand'
  | 'calibrate';

export interface ViewportState {
  id: string;
  name: string;
  pageNumber: number;
  bounds: { x: number; y: number; w: number; h: number };
  pixelsPerUnit: number;
  unit: string;
  scaleName: string;
  scalePreset: string | null;
}

export interface GroupState {
  id: string;
  name: string;
  color: string;
  type: 'linear' | 'area' | 'count';
  unit: string;
  sortOrder: number;
  targetField: string | null;
  isPreset: boolean;
  category: string | null;
  assemblyId: string | null;
  runningTotal: number;
}

export interface MeasurementState {
  id: string;
  groupId: string;
  pageNumber: number;
  viewportId: string | null;
  type: 'polyline' | 'polygon' | 'count' | 'annotation';
  geometry: unknown; // Fabric.js JSON
  calculatedValue: number;
  unit: string;
  label: string;
  notes: string;
  createdAt: string;
}

export interface TakeoffState {
  sessionId: string | null;
  sessionName: string;
  bidId: string | null;
  legacyBidId: number | null;
  pdfFileName: string | null;
  pageCount: number;
  currentPage: number;
  activeTool: ToolType;
  activePresetId: string | null;
  activeViewportId: string | null;
  selectedObjectId: string | null;
  viewports: Record<number, ViewportState[]>; // keyed by page number
  groups: GroupState[];
  measurements: Record<number, MeasurementState[]>; // keyed by page number
  pageStates: Record<number, unknown>; // keyed by page number → Fabric JSON
  zoom: number;
  isDirty: boolean;
  isLoading: boolean;
}

// ── Actions ──

export type TakeoffAction =
  | { type: 'INIT_SESSION'; payload: { sessionId: string; sessionName: string; bidId: string | null; legacyBidId: number | null; pdfFileName: string | null; pageCount: number } }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_TOOL'; payload: ToolType }
  | { type: 'SET_ACTIVE_PRESET'; payload: string | null }
  | { type: 'SET_ACTIVE_VIEWPORT'; payload: string | null }
  | { type: 'SELECT_OBJECT'; payload: string | null }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'MARK_CLEAN' }
  // Viewports
  | { type: 'ADD_VIEWPORT'; payload: ViewportState }
  | { type: 'UPDATE_VIEWPORT'; payload: { id: string; pageNumber: number; updates: Partial<ViewportState> } }
  | { type: 'DELETE_VIEWPORT'; payload: { id: string; pageNumber: number } }
  | { type: 'CALIBRATE_VIEWPORT'; payload: { id: string; pageNumber: number; pixelsPerUnit: number; scaleName: string; scalePreset: string | null } }
  // Groups
  | { type: 'SET_GROUPS'; payload: GroupState[] }
  | { type: 'ADD_GROUP'; payload: GroupState }
  | { type: 'UPDATE_GROUP'; payload: { id: string; updates: Partial<GroupState> } }
  | { type: 'DELETE_GROUP'; payload: string }
  | { type: 'UPDATE_GROUP_TOTAL'; payload: { id: string; total: number } }
  // Measurements
  | { type: 'ADD_MEASUREMENT'; payload: MeasurementState }
  | { type: 'UPDATE_MEASUREMENT'; payload: { id: string; pageNumber: number; updates: Partial<MeasurementState> } }
  | { type: 'DELETE_MEASUREMENT'; payload: { id: string; pageNumber: number; groupId: string } }
  | { type: 'SET_MEASUREMENTS'; payload: { pageNumber: number; measurements: MeasurementState[] } }
  // Page states
  | { type: 'SET_PAGE_STATE'; payload: { pageNumber: number; fabricJson: unknown } }
  // Bulk load
  | { type: 'LOAD_SESSION_DATA'; payload: { viewports: Record<number, ViewportState[]>; groups: GroupState[]; measurements: Record<number, MeasurementState[]>; pageStates: Record<number, unknown> } };

// ── Initial State ──

const initialState: TakeoffState = {
  sessionId: null,
  sessionName: '',
  bidId: null,
  legacyBidId: null,
  pdfFileName: null,
  pageCount: 0,
  currentPage: 1,
  activeTool: 'select',
  activePresetId: null,
  activeViewportId: null,
  selectedObjectId: null,
  viewports: {},
  groups: [],
  measurements: {},
  pageStates: {},
  zoom: 1,
  isDirty: false,
  isLoading: true,
};

// ── Reducer ──

function takeoffReducer(state: TakeoffState, action: TakeoffAction): TakeoffState {
  switch (action.type) {
    case 'INIT_SESSION':
      return {
        ...state,
        ...action.payload,
        isLoading: false,
      };

    case 'SET_PAGE':
      return { ...state, currentPage: action.payload, selectedObjectId: null };

    case 'SET_TOOL':
      return { ...state, activeTool: action.payload, selectedObjectId: null };

    case 'SET_ACTIVE_PRESET': {
      const preset = state.groups.find((g) => g.id === action.payload);
      let toolType: ToolType = 'select';
      if (preset) {
        if (preset.type === 'linear') toolType = 'polyline';
        else if (preset.type === 'area') toolType = 'polygon';
        else if (preset.type === 'count') toolType = 'count';
      }
      return {
        ...state,
        activePresetId: action.payload,
        activeTool: action.payload ? toolType : 'select',
      };
    }

    case 'SET_ACTIVE_VIEWPORT':
      return { ...state, activeViewportId: action.payload };

    case 'SELECT_OBJECT':
      return { ...state, selectedObjectId: action.payload };

    case 'SET_ZOOM':
      return { ...state, zoom: action.payload };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'MARK_CLEAN':
      return { ...state, isDirty: false };

    // ── Viewports ──
    case 'ADD_VIEWPORT': {
      const page = action.payload.pageNumber;
      const existing = state.viewports[page] ?? [];
      return {
        ...state,
        viewports: { ...state.viewports, [page]: [...existing, action.payload] },
        isDirty: true,
      };
    }

    case 'UPDATE_VIEWPORT': {
      const { id, pageNumber, updates } = action.payload;
      const vpList = (state.viewports[pageNumber] ?? []).map((vp) =>
        vp.id === id ? { ...vp, ...updates } : vp
      );
      return {
        ...state,
        viewports: { ...state.viewports, [pageNumber]: vpList },
        isDirty: true,
      };
    }

    case 'DELETE_VIEWPORT': {
      const { id, pageNumber } = action.payload;
      const filtered = (state.viewports[pageNumber] ?? []).filter((vp) => vp.id !== id);
      return {
        ...state,
        viewports: { ...state.viewports, [pageNumber]: filtered },
        isDirty: true,
      };
    }

    case 'CALIBRATE_VIEWPORT': {
      const { id, pageNumber, pixelsPerUnit, scaleName, scalePreset } = action.payload;
      const vpList = (state.viewports[pageNumber] ?? []).map((vp) =>
        vp.id === id ? { ...vp, pixelsPerUnit, scaleName, scalePreset } : vp
      );
      return {
        ...state,
        viewports: { ...state.viewports, [pageNumber]: vpList },
        isDirty: true,
      };
    }

    // ── Groups ──
    case 'SET_GROUPS':
      return { ...state, groups: action.payload };

    case 'ADD_GROUP':
      return { ...state, groups: [...state.groups, action.payload], isDirty: true };

    case 'UPDATE_GROUP': {
      const { id, updates } = action.payload;
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        isDirty: true,
      };
    }

    case 'DELETE_GROUP':
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.payload),
        isDirty: true,
      };

    case 'UPDATE_GROUP_TOTAL':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.payload.id ? { ...g, runningTotal: action.payload.total } : g
        ),
      };

    // ── Measurements ──
    case 'ADD_MEASUREMENT': {
      const page = action.payload.pageNumber;
      const existing = state.measurements[page] ?? [];
      return {
        ...state,
        measurements: { ...state.measurements, [page]: [...existing, action.payload] },
        isDirty: true,
      };
    }

    case 'UPDATE_MEASUREMENT': {
      const { id, pageNumber, updates } = action.payload;
      const measList = (state.measurements[pageNumber] ?? []).map((m) =>
        m.id === id ? { ...m, ...updates } : m
      );
      return {
        ...state,
        measurements: { ...state.measurements, [pageNumber]: measList },
        isDirty: true,
      };
    }

    case 'DELETE_MEASUREMENT': {
      const { id, pageNumber } = action.payload;
      const filtered = (state.measurements[pageNumber] ?? []).filter((m) => m.id !== id);
      return {
        ...state,
        measurements: { ...state.measurements, [pageNumber]: filtered },
        isDirty: true,
      };
    }

    case 'SET_MEASUREMENTS':
      return {
        ...state,
        measurements: { ...state.measurements, [action.payload.pageNumber]: action.payload.measurements },
      };

    // ── Page states ──
    case 'SET_PAGE_STATE':
      return {
        ...state,
        pageStates: { ...state.pageStates, [action.payload.pageNumber]: action.payload.fabricJson },
        isDirty: true,
      };

    // ── Bulk load ──
    case 'LOAD_SESSION_DATA':
      return {
        ...state,
        ...action.payload,
        isLoading: false,
      };

    default:
      return state;
  }
}

export function useMeasurementReducer() {
  return useReducer(takeoffReducer, initialState);
}

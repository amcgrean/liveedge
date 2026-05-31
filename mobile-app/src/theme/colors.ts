// Design tokens from Claude Design handoff
export const C = {
  green: '#006834',
  greenDark: '#004f27',
  greenBright: '#0a8a4a',
  greenSoft: '#e7f0ec',
  gold: '#9e8635',
  goldSoft: '#fcf5dd',
  bg: '#ffffff',
  surface: '#f9fafb',
  surface2: '#f3f4f6',
  line: '#e5e7eb',
  lineSoft: '#eef0f3',
  text: '#111827',
  text2: '#374151',
  text3: '#6b7280',
  text4: '#9ca3af',
  ok: '#16a34a',
  okSoft: '#dcfce7',
  okBorder: '#bbf7d0',
  warn: '#d97706',
  warnSoft: '#fef3c7',
  warnBorder: '#fde68a',
  err: '#dc2626',
  errSoft: '#fee2e2',
  // branch dots
  fortDodge: '#dc2626',
  grimes: '#16a34a',
  birchwood: '#d4a23a',
  coralville: '#64748b',
};

// Sales-specific palette — order lifecycle + quote/write states + live cues.
// Mirrors the `S` tokens from the Sales design handoff. Layers on top of C.
export const S = {
  // order lifecycle — a 5-stop scale from placed → closed
  open: '#64748b', openSoft: '#eef1f5', // slate · just placed
  picking: '#d97706', pickingSoft: '#fef3c7', // amber · being pulled at yard
  staged: '#0a8a4a', stagedSoft: '#e3f5ea', // bright green · ready
  delivery: '#006834', deliverySoft: '#e7f0ec', // green · on the truck
  invoiced: '#475569', invoicedSoft: '#f1f5f9', // dark slate · closed
  // quote / write states
  draft: '#9e8635', draftSoft: '#fcf5dd',
  live: '#0a8a4a', liveSoft: '#e3f5ea',
  blue: '#2563eb', blueSoft: '#eaf1fe',
};

export const FONT = {
  body: undefined, // System default (San Francisco on iOS)
  mono: 'Menlo', // iOS monospace
};

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardElevated: {
    shadowColor: '#006834',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  fab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
};

export type BranchCode = '10FD' | '20GR' | '25BW' | '40CV';

export const BRANCHES: {
  code: BranchCode;
  name: string;
  addr: string;
  dot: string;
}[] = [
  { code: '10FD', name: 'Fort Dodge', addr: '1521 5th Ave S, Fort Dodge IA', dot: C.fortDodge },
  { code: '20GR', name: 'Grimes', addr: '2400 SE 37th St, Grimes IA', dot: C.grimes },
  { code: '25BW', name: 'Birchwood', addr: '845 NE Birchwood Dr, Ankeny IA', dot: C.birchwood },
  { code: '40CV', name: 'Coralville', addr: '2727 2nd St, Coralville IA', dot: C.coralville },
];

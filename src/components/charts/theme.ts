// Chart palette anchored to existing Tailwind tokens.
// `cyan-*` is remapped to Beisser green (#006834) and `gold-*` is custom (#9e8635).
// Branch + status colors mirror existing inline maps in TopNav and ReportsClient.

export const CHART_COLORS = {
  base: '#1a9248',        // Beisser green (cyan-500-ish in our palette) — base year / current
  compare: '#64748b',     // slate-500 — prior year / compare
  positive: '#34d399',    // emerald-400
  negative: '#f87171',    // red-400
  warn: '#fbbf24',        // amber-400
  accent: '#c0a040',      // Beisser gold — Pareto cumulative line
  branch: {
    '10FD': '#fca5a5',    // red-300   Fort Dodge
    '20GR': '#67e8f9',    // cyan-300  Grimes
    '25BW': '#fcd34d',    // amber-300 Birchwood
    '40CV': '#cbd5e1',    // slate-300 Coralville
  } as Record<string, string>,
  categorical: [
    '#1a9248', '#c0a040', '#67e8f9', '#a78bfa',
    '#f472b6', '#fb923c', '#94a3b8', '#34d399',
  ],
  // Pipeline order: O/B → K → S → P → D → I
  status: {
    O: '#60a5fa', B: '#60a5fa',  // Open / Blank
    K: '#fbbf24',                // Picking
    S: '#fb923c',                // Staged
    P: '#a78bfa',                // Picked
    D: '#22d3ee',                // Delivered
    I: '#34d399',                // Invoiced
    H: '#94a3b8',                // Hold
    C: '#475569',                // Cancelled
    Q: '#a78bfa',                // Quote
  } as Record<string, string>,
  axis: '#64748b',         // slate-500
  grid: '#334155',         // slate-700
  tooltipBg: '#0f172a',    // slate-900
  tooltipBorder: '#334155',
  text: '#e2e8f0',         // slate-200
  textMuted: '#94a3b8',    // slate-400
};

export const STATUS_PIPELINE_ORDER = ['O', 'B', 'Q', 'H', 'K', 'S', 'P', 'D', 'I', 'C'];

export const STATUS_LABELS: Record<string, string> = {
  O: 'Open',
  B: 'Open',
  Q: 'Quote',
  H: 'Hold',
  K: 'Picking',
  S: 'Staged',
  P: 'Picked',
  D: 'Delivered',
  I: 'Invoiced',
  C: 'Cancelled',
};

export const AXIS_PROPS = {
  stroke: CHART_COLORS.axis,
  tick: { fill: CHART_COLORS.textMuted, fontSize: 11 },
} as const;

export const GRID_PROPS = {
  stroke: CHART_COLORS.grid,
  strokeDasharray: '2 4',
} as const;

export const TOOLTIP_STYLE = {
  backgroundColor: CHART_COLORS.tooltipBg,
  border: `1px solid ${CHART_COLORS.tooltipBorder}`,
  borderRadius: 6,
  color: CHART_COLORS.text,
  fontSize: 12,
} as const;

export const TOOLTIP_LABEL_STYLE = { color: CHART_COLORS.textMuted } as const;
export const TOOLTIP_ITEM_STYLE = { color: CHART_COLORS.text } as const;

export const fmtCurrency0 = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

export const fmtCurrencyCompact = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

export const fmtPct1 = (n: number): string => `${(n * 100).toFixed(1)}%`;
export const fmtPct1FromPct = (n: number): string => `${n.toFixed(1)}%`;

export const fmtNumber = (n: number): string => n.toLocaleString();

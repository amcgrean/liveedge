'use client';

export interface TimelineEvent {
  label: string;
  time: string | null;
  detail?: string;
}

export interface TimelineData {
  events: TimelineEvent[];
  ar: { balance: number | null; open_count: number };
  so: {
    reference: string | null;
    sale_type: string | null;
    expect_date: string | null;
    shipto_address_1: string | null;
    shipto_city: string | null;
    cust_code: string | null;
    ship_via: string | null;
  };
}

interface Props {
  timeline: TimelineData | null;
  loading: boolean;
}

export function StopTimeline({ timeline, loading }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Activity</div>
      {loading ? (
        <div className="text-xs text-gray-500 text-center py-6">Loading timeline…</div>
      ) : !timeline ? (
        <div className="text-xs text-red-400 text-center py-6">Could not load timeline.</div>
      ) : timeline.events.length === 0 ? (
        <div className="text-xs text-gray-600 text-center py-6">No timeline events yet.</div>
      ) : (
        <ol className="relative border-l border-gray-700 ml-2 space-y-4">
          {timeline.events.map((ev, i) => (
            <li key={i} className="pl-4">
              <span className="absolute -left-1 w-2 h-2 rounded-full bg-cyan-500 mt-0.5" />
              <div className="text-xs font-medium text-gray-200">{ev.label}</div>
              {ev.time && (
                <div className="text-xs text-gray-500">{new Date(ev.time).toLocaleString()}</div>
              )}
              {ev.detail && (
                <div className="text-xs text-gray-500 italic">{ev.detail}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

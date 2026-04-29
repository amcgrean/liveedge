export default function DeliveryReportingLoading() {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-slate-800/60 rounded" />
          <div className="h-7 w-56 bg-slate-800 rounded" />
          <div className="h-4 w-72 bg-slate-800/60 rounded" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-20 bg-slate-800 rounded-md" />
          ))}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-20" />
        ))}
      </div>

      {/* Daily bars */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-44" />

      {/* Two breakdown panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-48" />
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-48" />
      </div>

      {/* Detail */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-72" />
    </div>
  );
}

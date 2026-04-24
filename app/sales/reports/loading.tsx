export default function ReportsLoading() {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-slate-800/60 rounded" />
          <div className="h-7 w-52 bg-slate-800 rounded" />
          <div className="h-4 w-40 bg-slate-800/60 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-32 bg-slate-800 rounded-lg" />
          <div className="h-8 w-28 bg-slate-800 rounded-lg" />
          <div className="h-8 w-8 bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-20" />
        ))}
      </div>

      {/* Chart */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-44" />

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-56" />
        ))}
      </div>

      {/* Top customers table */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 h-10 bg-slate-800/60" />
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="h-9 bg-slate-800/60 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

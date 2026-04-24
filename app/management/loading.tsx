export default function ManagementLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-56 bg-slate-800 rounded" />
        <div className="h-4 w-80 bg-slate-800/60 rounded" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-28 bg-slate-800 rounded-md" />
        ))}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-24" />
        ))}
      </div>

      {/* Branch table */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
        <div className="h-4 w-32 bg-slate-700 rounded" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 bg-slate-800/60 rounded" />
          ))}
        </div>
      </div>

      {/* 3-year comparison */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
        <div className="h-4 w-40 bg-slate-700 rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 bg-slate-800/60 rounded" />
          ))}
        </div>
      </div>

      {/* Report tiles grid */}
      <div className="h-4 w-36 bg-slate-700 rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 h-32" />
        ))}
      </div>
    </div>
  );
}

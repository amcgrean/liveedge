export default function RepLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-pulse">
      <div className="flex gap-1 border-b border-slate-700 mb-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-2.5 w-32 h-9 rounded-t bg-slate-800/60" />
        ))}
      </div>
      <div className="space-y-1">
        <div className="h-7 w-40 bg-slate-800 rounded" />
        <div className="h-4 w-56 bg-slate-800/60 rounded" />
      </div>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-24 bg-slate-800 rounded-md" />
        ))}
      </div>
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
        <div className="h-8 bg-slate-700/60 rounded mb-2" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-9 bg-slate-800/60 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

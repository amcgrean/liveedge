export default function ProductLoading() {
  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-6 animate-pulse">
      <div className="flex gap-1 border-b border-slate-700 mb-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-2.5 w-32 h-9 rounded-t bg-slate-800/60" />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-6 w-52 bg-slate-800 rounded" />
          <div className="h-4 w-72 bg-slate-800/60 rounded" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-24 bg-slate-800 rounded-md" />
        ))}
      </div>
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
        <div className="h-4 w-40 bg-slate-700 rounded" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="h-9 bg-slate-800/60 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

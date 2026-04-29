export default function ForecastLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[110rem] mx-auto animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 bg-slate-800/60 rounded" />
        <div className="h-7 w-72 bg-slate-800 rounded" />
        <div className="h-4 w-56 bg-slate-800/60 rounded" />
      </div>
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-48" />
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 h-96" />
    </div>
  );
}

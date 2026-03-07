export default function LoadTestResults({ running, progress, live, results }) {
  const data = running ? live : results;
  if (!data && !running) return null;

  const successRate = results
    ? parseFloat(results.successRate)
    : ((live.success / (live.sent || 1)) * 100);

  return (
    <div className="flex flex-col gap-4">

      {/* Progress bar — only during run */}
      {running && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-white/30 uppercase tracking-widest font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 anim-pulse" />
              Running
            </span>
            <span className="font-mono-custom text-xs text-white/40">{progress}%</span>
          </div>
          <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Live counters */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Sent"      value={data.sent?.toLocaleString()      ?? "0"} />
        <StatCard label="Success"   value={data.success?.toLocaleString()   ?? "0"} color="text-emerald-400" />
        <StatCard label="Cancelled" value={data.cancelled?.toLocaleString() ?? "0"} color="text-amber-400" />
        <StatCard label="Failed"    value={data.failed?.toLocaleString()    ?? "0"} color="text-red-400" />
      </div>

      {/* Final results */}
      {results && !running && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Duration"     value={`${results.elapsed}s`} />
            <StatCard label="Req / sec"    value={results.rps} color="text-white" />
            <StatCard
              label="Success rate"
              value={`${results.successRate}%`}
              color={successRate >= 95 ? "text-emerald-400" : "text-red-400"}
            />
          </div>

          {/* Latency */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
            <p className="text-[11px] font-medium text-white/25 uppercase tracking-widest mb-3">Latency</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Avg", value: `${results.avg}ms` },
                { label: "p50", value: `${results.p50}ms` },
                { label: "p95", value: `${results.p95}ms`, warn: parseInt(results.p95) > 2000 },
                { label: "p99", value: `${results.p99}ms`, warn: parseInt(results.p99) > 5000 },
              ].map(({ label, value, warn }) => (
                <div key={label} className="text-center">
                  <p className="font-mono-custom text-[10px] text-white/20 mb-1">{label}</p>
                  <p className={`font-mono-custom text-sm font-medium ${warn ? "text-red-400" : "text-white/60"}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Breakdown bars */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
            <p className="text-[11px] font-medium text-white/25 uppercase tracking-widest mb-3">Breakdown</p>
            <div className="flex flex-col gap-3">
              {[
                { label: "Success",   val: results.success,   color: "bg-emerald-400" },
                { label: "Cancelled", val: results.cancelled, color: "bg-amber-400" },
                { label: "Failed",    val: results.failed,    color: "bg-red-400" },
                { label: "Errors",    val: results.errors,    color: "bg-red-700" },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-[11px] text-white/25 w-16 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full transition-all duration-700`}
                      style={{ width: `${(val / (results.sent || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono-custom text-[11px] text-white/30 w-10 text-right">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color = "text-white/50" }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-center">
      <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest mb-1.5">{label}</p>
      <p className={`font-mono-custom text-base font-medium ${color}`}>{value}</p>
    </div>
  );
}
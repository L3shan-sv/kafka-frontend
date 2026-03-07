import { useState } from "react";

const labelCls = "block text-[11px] font-medium text-white/30 uppercase tracking-widest mb-3";

function SliderRow({ label, value, min, max, step = 1, onChange, accentColor = "white" }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={labelCls} style={{ marginBottom: 0 }}>{label}</label>
        <span className="font-mono-custom text-xs text-white/50">{Number(value).toLocaleString()}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer bg-white/10"
        style={{ accentColor }}
      />
    </div>
  );
}

export default function LoadTestConfig({ onRun, onAbort, running }) {
  const [concurrency,    setConcurrency]    = useState(50);
  const [totalRides,     setTotalRides]     = useState(500);
  const [includeCancels, setIncludeCancels] = useState(true);
  const [cancelRate,     setCancelRate]     = useState(30);

  const cancelCount = Math.round(totalRides * cancelRate / 100);
  const totalReqs   = totalRides + (includeCancels ? cancelCount : 0);

  return (
    <div className="flex flex-col gap-6">

      <SliderRow label="Concurrency"  value={concurrency} min={1}  max={200}  onChange={setConcurrency} />
      <SliderRow label="Total rides"  value={totalRides}  min={10} max={10000} step={10} onChange={setTotalRides} />

      {/* Toggle */}
      <div className="flex items-center justify-between">
        <label className={labelCls} style={{ marginBottom: 0 }}>Include cancellations</label>
        <button
          onClick={() => setIncludeCancels(v => !v)}
          className={`relative w-10 h-5 rounded-full border transition-all duration-200 ${
            includeCancels ? "bg-white/20 border-white/30" : "bg-white/5 border-white/10"
          }`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${
            includeCancels ? "left-5" : "left-0.5"
          }`} />
        </button>
      </div>

      {includeCancels && (
        <div className="anim-fadeup">
          <SliderRow
            label={`Cancel rate`}
            value={cancelRate}
            min={1} max={100}
            onChange={setCancelRate}
            accentColor="#e74c3c"
          />
        </div>
      )}

      {/* Summary */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 flex flex-col gap-2">
        <SummaryRow label="Ride requests"       value={totalRides.toLocaleString()}   />
        {includeCancels && (
          <SummaryRow label="~Cancellations"    value={cancelCount.toLocaleString()}  dim />
        )}
        <div className="border-t border-white/5 pt-2 mt-1">
          <SummaryRow label="Total HTTP calls"  value={totalReqs.toLocaleString()}    highlight />
        </div>
      </div>

      {!running ? (
        <button
          onClick={() => onRun({ concurrency, totalRides, includeCancels, cancelRate })}
          className="w-full py-3.5 rounded-xl bg-white text-black text-sm font-semibold
            hover:bg-white/90 active:scale-[0.99] transition-all duration-150"
        >
          Run load test
        </button>
      ) : (
        <button
          onClick={onAbort}
          className="w-full py-3.5 rounded-xl border border-red-500/40 text-red-400 text-sm font-semibold
            hover:bg-red-500/8 active:scale-[0.99] transition-all duration-150"
        >
          Abort
        </button>
      )}
    </div>
  );
}

function SummaryRow({ label, value, dim, highlight }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${dim ? "text-white/20" : "text-white/35"}`}>{label}</span>
      <span className={`font-mono-custom text-xs ${highlight ? "text-white/70" : dim ? "text-white/25" : "text-white/45"}`}>
        {value}
      </span>
    </div>
  );
}
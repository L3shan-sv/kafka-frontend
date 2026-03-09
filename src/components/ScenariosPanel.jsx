import { useRef, useEffect } from "react";

// ── constants ──────────────────────────────────────────────────────────────────
const RIDE_STEPS = [
  { key: "requested", label: "Requested" },
  { key: "matched",   label: "Matched"   },
  { key: "accepted",  label: "Accepted"  },
  { key: "started",   label: "Started"   },
  { key: "completed", label: "Completed" },
];
const STATE_ORDER = ["idle","requested","matched","accepted","started","completed","dlq"];

const SERVICE_LABELS = {
  "ride-request": "ride-request",
  "driver-match": "driver-match",
  "payment":      "payment     ",
  "notification": "notification",
  "analytics":    "analytics   ",
  "kafka":        "kafka       ",
  "redis":        "redis       ",
  "load-test":    "load-test   ",
  "system":       "system      ",
};

const LEVEL_CLS = {
  INFO:  "text-white/50",
  WARN:  "text-amber-400",
  ERROR: "text-red-400",
  DEBUG: "text-white/25",
};

const SERVICE_CLS = {
  "ride-request": "text-sky-400",
  "driver-match": "text-violet-400",
  "payment":      "text-emerald-400",
  "notification": "text-blue-400",
  "analytics":    "text-amber-400",
  "kafka":        "text-orange-400",
  "redis":        "text-red-400",
  "load-test":    "text-white/60",
  "system":       "text-white/30",
};

const HEALTH_CLS = {
  healthy:    "bg-emerald-500",
  down:       "bg-red-500",
  recovering: "bg-amber-400",
};

const HEALTH_TEXT = {
  healthy:    "text-emerald-400",
  down:       "text-red-400",
  recovering: "text-amber-400",
};

const FAILURE_SCENARIOS = [
  { id: "payment_down",       icon: "💳", title: "Payment Service Down",   badge: "P1", badgeCls: "text-red-400 border-red-500/30 bg-red-500/8" },
  { id: "kafka_down",         icon: "📨", title: "Kafka / MSK Down",       badge: "P1", badgeCls: "text-red-400 border-red-500/30 bg-red-500/8" },
  { id: "redis_down",         icon: "🔴", title: "Redis Down",             badge: "P1", badgeCls: "text-red-400 border-red-500/30 bg-red-500/8" },
  { id: "driver_match_down",  icon: "🚗", title: "Driver Match Down",      badge: "P2", badgeCls: "text-amber-400 border-amber-500/30 bg-amber-500/8" },
  { id: "simultaneous_cancel",icon: "⚔️", title: "Simultaneous Cancel",   badge: "RACE", badgeCls: "text-blue-400 border-blue-500/30 bg-blue-500/8" },
];

const SCENARIOS = [
  { id: "happy",    label: "Happy Path",        icon: "✓", activeCls: "border-emerald-500/30 bg-emerald-500/8", iconCls: "text-emerald-400" },
  { id: "dlq",      label: "DLQ · 5 Declines",  icon: "↩", activeCls: "border-violet-500/30 bg-violet-500/8",  iconCls: "text-violet-400"  },
  { id: "load",     label: "Load Test 10k",     icon: "⚡", activeCls: "border-amber-500/30 bg-amber-500/8",   iconCls: "text-amber-400"   },
  { id: "failures", label: "Failure Scenarios", icon: "☠", activeCls: "border-red-500/30 bg-red-500/8",       iconCls: "text-red-400"     },
];

// ── sub-components ─────────────────────────────────────────────────────────────

function HealthBar({ health }) {
  const services = ["ride-request", "driver-match", "payment", "notification", "analytics", "kafka", "redis"];
  return (
    <div className="flex items-center gap-3 px-1 py-3 border-b border-white/5 flex-wrap">
      <span className="text-[9px] text-white/20 uppercase tracking-widest flex-shrink-0">Health</span>
      {services.map(s => (
        <div key={s} className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${HEALTH_CLS[health[s]] ?? "bg-white/20"} ${health[s] === "down" ? "animate-pulse" : ""}`} />
          <span className={`text-[10px] font-mono ${HEALTH_TEXT[health[s]] ?? "text-white/30"}`}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function LogLine({ entry }) {
  const svcLabel = SERVICE_LABELS[entry.service] || entry.service.padEnd(12);
  const levelCls = LEVEL_CLS[entry.level] || "text-white/40";
  const svcCls   = SERVICE_CLS[entry.service] || "text-white/40";
  const hasMeta  = Object.keys(entry.meta || {}).length > 0;

  return (
    <div className="flex gap-0 font-mono text-[11px] leading-[1.7] hover:bg-white/[0.02] px-1 rounded">
      <span className="text-white/15 flex-shrink-0 tabular-nums w-[152px]">{entry.ts}</span>
      <span className="text-white/20 flex-shrink-0 w-3 mx-1">|</span>
      <span className={`flex-shrink-0 w-[96px] ${svcCls}`}>{svcLabel}</span>
      <span className="text-white/20 flex-shrink-0 w-3 mx-1">|</span>
      <span className={`flex-shrink-0 w-[42px] font-medium ${levelCls}`}>{entry.level}</span>
      <span className="text-white/20 flex-shrink-0 w-3 mx-1">|</span>
      <span className="text-white/55 flex-wrap break-all">
        {entry.message}
        {hasMeta && (
          <span className="text-white/20 ml-2">
            {Object.entries(entry.meta).map(([k, v]) => `${k}=${v}`).join(" ")}
          </span>
        )}
      </span>
    </div>
  );
}

function LogViewer({ logs, running }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex-1 overflow-y-auto p-3 min-h-0">
      {logs.length === 0 && (
        <span className="font-mono text-[11px] text-white/15">Waiting for events…</span>
      )}
      {logs.map(entry => <LogLine key={entry.id} entry={entry} />)}
      {running && (
        <div className="flex items-center gap-2 mt-2 px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
          <span className="font-mono text-[10px] text-white/20">running</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function StateTimeline({ rideState }) {
  const currentIdx = STATE_ORDER.indexOf(rideState);
  if (rideState === "dlq") return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/8 border border-red-500/20">
      <span className="text-red-400 text-base">☠</span>
      <div>
        <p className="text-xs font-medium text-red-400">ride.DLQ</p>
        <p className="text-[10px] text-white/25 mt-0.5">5 driver declines exhausted · rider notified</p>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-0">
      {RIDE_STEPS.map((step, i) => {
        const stepIdx  = STATE_ORDER.indexOf(step.key);
        const isActive = rideState === step.key;
        const isDone   = currentIdx > stepIdx && rideState !== "idle";
        return (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-400 ${
                isActive ? "border-white bg-white/15 shadow-[0_0_8px_rgba(255,255,255,0.15)]" :
                isDone   ? "border-white/30 bg-white/8" :
                           "border-white/8 bg-transparent"
              }`}>
                {isDone   && <span className="text-[8px] text-white/50">✓</span>}
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <span className={`text-[9px] uppercase tracking-wide ${isActive ? "text-white/60" : isDone ? "text-white/25" : "text-white/12"}`}>
                {step.label}
              </span>
            </div>
            {i < RIDE_STEPS.length - 1 && (
              <div className={`flex-1 h-px mb-4 mx-1 transition-all duration-500 ${isDone ? "bg-white/20" : "bg-white/5"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RetryMeter({ count, max = 5 }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-white/20 uppercase tracking-widest">Retries</span>
      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} className={`w-5 h-5 rounded border flex items-center justify-center text-[9px] transition-all duration-200 ${
            i < count ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-white/8 text-white/10"
          }`}>
            {i < count ? "✕" : "·"}
          </div>
        ))}
      </div>
      {count >= max && <span className="text-[10px] text-red-400 font-medium ml-1">→ DLQ</span>}
    </div>
  );
}

function LoadBar({ label, value, max, colorCls }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[9px] text-white/20 uppercase tracking-widest">{label}</span>
        <span className={`font-mono text-[10px] ${colorCls}`}>{value?.toLocaleString()}</span>
      </div>
      <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${colorCls.replace("text-", "bg-")}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function ScenariosPanel({
  running, logs, rideState, retryCount,
  loadStats, activeFailure, health,
  activeScenario, startScenario, abort,
}) {
  const isFailures = activeScenario === "failures";

  return (
    <div className="flex gap-5">

      {/* ── Left sidebar ── */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-3">
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col gap-1.5">
          <p className="text-[9px] font-medium text-white/20 uppercase tracking-widest mb-1">Scenarios</p>
          {SCENARIOS.map(s => (
            <button key={s.id}
              onClick={() => !running && startScenario(s.id)}
              disabled={running && activeScenario !== s.id}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all duration-150
                ${activeScenario === s.id ? s.activeCls : "border-white/5 bg-transparent hover:bg-white/[0.03]"}
                ${running && activeScenario !== s.id ? "opacity-25 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <span className={`text-sm ${activeScenario === s.id ? s.iconCls : "text-white/20"}`}>{s.icon}</span>
              <span className={`text-xs font-medium ${activeScenario === s.id ? "text-white/70" : "text-white/30"}`}>{s.label}</span>
              {running && activeScenario === s.id && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {isFailures && (
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col gap-1.5">
            <p className="text-[9px] font-medium text-white/20 uppercase tracking-widest mb-1">Failure</p>
            {FAILURE_SCENARIOS.map(f => (
              <button key={f.id}
                onClick={() => !running && startScenario("failures", f.id)}
                disabled={running}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all duration-150
                  ${activeFailure === f.id ? "border-white/15 bg-white/5" : "border-white/5 bg-transparent hover:bg-white/[0.03]"}
                  ${running ? "opacity-25 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                <span className="text-sm flex-shrink-0">{f.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-medium text-white/45 truncate">{f.title}</span>
                    <span className={`text-[8px] border rounded px-1 flex-shrink-0 ${f.badgeCls}`}>{f.badge}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {running && (
          <button onClick={abort}
            className="w-full py-2 rounded-xl border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/8 transition-all">
            Abort
          </button>
        )}
      </div>

      {/* ── Right: output ── */}
      <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden" style={{ minHeight: "calc(100vh - 160px)" }}>

        {!activeScenario && (
          <div className="flex-1 flex items-center justify-center bg-white/[0.01] border border-white/5 rounded-xl border-dashed">
            <p className="text-white/15 text-sm">Select a scenario to run</p>
          </div>
        )}

        {activeScenario && (
          <div className="flex-1 flex flex-col bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">

            {/* health bar */}
            <HealthBar health={health} />

            {/* scenario-specific widgets */}
            {activeScenario === "happy" && rideState !== "idle" && (
              <div className="px-4 py-3 border-b border-white/5">
                <StateTimeline rideState={rideState} />
              </div>
            )}

            {activeScenario === "dlq" && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <RetryMeter count={retryCount} max={5} />
                <span className={`font-mono text-xs ${rideState === "dlq" ? "text-red-400" : "text-white/30"}`}>
                  state: {rideState}
                </span>
              </div>
            )}

            {activeScenario === "load" && loadStats && (
              <div className="px-4 py-3 border-b border-white/5">
                {/* progress */}
                {running && (
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-[9px] text-white/20 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" /> Running
                      </span>
                      <span className="font-mono text-[10px] text-white/30">{loadStats.progress}%</span>
                    </div>
                    <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-white/30 transition-all duration-300 rounded-full"
                        style={{ width: `${loadStats.progress}%` }} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2.5">
                    <LoadBar label="Success"          value={loadStats.success}          max={10000} colorCls="text-emerald-400" />
                    <LoadBar label="Failed"           value={loadStats.failed}           max={10000} colorCls="text-red-400" />
                    <LoadBar label="Rider Cancelled"  value={loadStats.rider_cancelled}  max={500}   colorCls="text-amber-400" />
                    <LoadBar label="Driver Cancelled" value={loadStats.driver_cancelled} max={200}   colorCls="text-orange-400" />
                    <LoadBar label="Mutual Cancel"    value={loadStats.mutual_cancelled} max={700}   colorCls="text-violet-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 content-start">
                    {[
                      { l: "Sent",     v: loadStats.sent?.toLocaleString(),    c: "text-white/50" },
                      { l: "RPS",      v: loadStats.rps,                       c: "text-white/70" },
                      { l: "p50",      v: `${loadStats.p50}ms`,                c: "text-white/50" },
                      { l: "p95",      v: `${loadStats.p95}ms`,                c: parseInt(loadStats.p95) > 2000 ? "text-red-400" : "text-white/50" },
                      { l: "Success%", v: `${loadStats.successRate}%`,         c: parseFloat(loadStats.successRate) > 95 ? "text-emerald-400" : "text-red-400" },
                      { l: "Elapsed",  v: `${loadStats.elapsed}s`,             c: "text-white/30" },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="bg-white/[0.02] rounded-lg p-2 text-center">
                        <p className="text-[8px] text-white/15 uppercase tracking-widest mb-1">{l}</p>
                        <p className={`font-mono text-[11px] font-medium ${c}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* log header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 flex-shrink-0">
              <span className="text-[9px] text-white/20 uppercase tracking-widest font-mono">
                timestamp · service · level · message
              </span>
              <span className="text-[9px] text-white/15 font-mono">{logs.length} entries</span>
            </div>

            {/* logs */}
            <LogViewer logs={logs} running={running} />
          </div>
        )}
      </div>
    </div>
  );
}
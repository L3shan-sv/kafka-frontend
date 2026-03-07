import { useState } from "react";

export default function ResponseViewer({ response, log, error }) {
  const [tab, setTab] = useState("response");

  return (
    <div className="flex flex-col bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden h-full">

      {/* Tab bar */}
      <div className="flex items-center border-b border-white/5 px-1">
        {[
          { id: "response", label: "Response",   badge: response ? "●" : null },
          { id: "log",      label: "Event log",  badge: log.length > 0 ? log.length : null },
        ].map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 -mb-px transition-all duration-150 ${
              tab === id
                ? "border-white text-white"
                : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {label}
            {badge && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                tab === id ? "bg-white/10 text-white/60" : "bg-white/5 text-white/20"
              }`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {tab === "response" && (
          <div className="flex flex-col gap-3">
            {error && (
              <div className="text-xs font-mono-custom text-red-400 bg-red-500/8 border border-red-500/15 rounded-lg p-3 leading-relaxed">
                {error}
              </div>
            )}
            {response ? (
              <pre className="font-mono-custom text-xs text-white/40 leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(response, null, 2)}
              </pre>
            ) : (
              <span className="font-mono-custom text-xs text-white/15">Waiting for response…</span>
            )}
          </div>
        )}

        {tab === "log" && (
          <div className="flex flex-col gap-2">
            {log.length === 0 ? (
              <span className="font-mono-custom text-xs text-white/15">No events yet</span>
            ) : (
              log.map(entry => (
                <div key={entry.id} className="flex gap-3 font-mono-custom text-[11.5px] leading-relaxed">
                  <span className="text-white/20 flex-shrink-0">{entry.ts}</span>
                  <span className={
                    entry.type === "success" ? "text-emerald-400" :
                    entry.type === "error"   ? "text-red-400"     :
                    entry.type === "muted"   ? "text-white/15"    :
                    "text-white/40"
                  }>
                    {entry.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
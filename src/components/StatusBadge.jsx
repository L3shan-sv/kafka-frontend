import { RIDE_STATE_META } from "../constants";

const ACTIVE_STATES = new Set(["requesting", "requested", "matched", "accepted", "started"]);

export default function StatusBadge({ state, correlationId }) {
  const meta    = RIDE_STATE_META[state] || RIDE_STATE_META.idle;
  const isLive  = ACTIVE_STATES.has(state);

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
      <div className="flex items-center gap-2.5">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${isLive ? "anim-pulse" : ""}`}
          style={{ background: meta.color, boxShadow: isLive ? `0 0 8px ${meta.color}` : "none" }}
        />
        <span className="text-sm font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>

      {correlationId && (
        <span className="font-mono-custom text-[11px] text-white/20 truncate max-w-[180px]">
          {correlationId}
        </span>
      )}
    </div>
  );
}
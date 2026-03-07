import { useState } from "react";
import { LOCATIONS, RIDE_TYPES, CANCEL_REASONS, RIDER_IDS } from "../constants";

const selectCls = `
  w-full bg-white/[0.04] border border-white/8 rounded-lg px-3.5 py-2.5
  text-sm text-white/80 outline-none cursor-pointer appearance-none
  hover:bg-white/[0.07] hover:border-white/15 transition-all duration-150
  focus:border-white/20
`.trim();

const labelCls = "block text-[11px] font-medium text-white/30 uppercase tracking-widest mb-2";

function Field({ label, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function RideForm({ rideState, onRequest, onCancel, onReset }) {
  const [riderId,      setRiderId]      = useState("user_42");
  const [pickup,       setPickup]       = useState(LOCATIONS[0]);
  const [dropoff,      setDropoff]      = useState(LOCATIONS[1]);
  const [rideType,     setRideType]     = useState("standard");
  const [cancelReason, setCancelReason] = useState("changed_plans");

  const canRequest = ["idle", "completed", "cancelled", "failed"].includes(rideState);
  const canCancel  = ["requested", "matched", "accepted", "started"].includes(rideState);
  const isLoading  = rideState === "requesting";

  return (
    <div className="flex flex-col gap-5">

      {/* Rider ID */}
      <Field label="Rider">
        <div className="relative">
          <select
            className={selectCls}
            value={riderId}
            onChange={e => setRiderId(e.target.value)}
          >
            {RIDER_IDS.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <ChevronIcon />
        </div>
      </Field>

      {/* Route */}
      <div>
        <label className={labelCls}>Route</label>
        <div className="flex gap-3 items-stretch">

          {/* Visual line */}
          <div className="flex flex-col items-center pt-3 pb-3 gap-0">
            <div className="w-2 h-2 rounded-full bg-white flex-shrink-0" />
            <div className="w-px flex-1 bg-white/10 my-1" />
            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
          </div>

          {/* Selects */}
          <div className="flex flex-col gap-2 flex-1">
            <div className="relative">
              <select
                className={selectCls}
                value={pickup.address}
                onChange={e => setPickup(LOCATIONS.find(l => l.address === e.target.value))}
              >
                {LOCATIONS.map(l => <option key={l.address}>{l.address}</option>)}
              </select>
              <ChevronIcon />
            </div>
            <div className="relative">
              <select
                className={selectCls}
                value={dropoff.address}
                onChange={e => setDropoff(LOCATIONS.find(l => l.address === e.target.value))}
              >
                {LOCATIONS.map(l => <option key={l.address}>{l.address}</option>)}
              </select>
              <ChevronIcon />
            </div>
          </div>
        </div>
      </div>

      {/* Ride type */}
      <Field label="Ride type">
        <div className="flex flex-col gap-1.5">
          {RIDE_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setRideType(t.id)}
              className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all duration-150 ${
                rideType === t.id
                  ? "bg-white/8 border-white/25 text-white"
                  : "bg-white/[0.02] border-white/5 text-white/40 hover:text-white/70 hover:border-white/12"
              }`}
            >
              <span className="text-sm font-medium">{t.label}</span>
              <span className={`text-xs ${rideType === t.id ? "text-white/40" : "text-white/20"}`}>{t.sub}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* Cancel reason */}
      {canCancel && (
        <div className="anim-fadeup">
          <Field label="Cancel reason">
            <div className="relative">
              <select
                className={selectCls}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              >
                {CANCEL_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <ChevronIcon />
            </div>
          </Field>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        {canRequest && (
          <button
            onClick={() => onRequest({ riderId, pickup, dropoff, rideType })}
            disabled={isLoading || pickup.address === dropoff.address}
            className="w-full py-3 rounded-lg bg-white text-black text-sm font-semibold
              hover:bg-white/90 active:scale-[0.99] transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? <Spinner dark /> : "Request ride"}
          </button>
        )}

        {canCancel && (
          <button
            onClick={() => onCancel({ riderId, reason: cancelReason })}
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-red-500/90 text-white text-sm font-semibold
              hover:bg-red-500 active:scale-[0.99] transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? <Spinner /> : "Cancel ride"}
          </button>
        )}

        {rideState !== "idle" && (
          <button
            onClick={onReset}
            className="w-full py-2.5 rounded-lg border border-white/8 text-white/30 text-sm
              hover:text-white/60 hover:border-white/15 transition-all duration-150"
          >
            Reset
          </button>
        )}
      </div>

    </div>
  );
}

function ChevronIcon() {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>
  );
}

function Spinner({ dark }) {
  return (
    <span
      className="w-4 h-4 rounded-full border-2 border-transparent anim-spin"
      style={{ borderTopColor: dark ? "#000" : "#fff" }}
    />
  );
}
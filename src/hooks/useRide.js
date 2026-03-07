

import { useState, useCallback } from "react";
import { API_BASE } from "../constants";

export function useRide() {
  const [state,         setState]         = useState("idle");
  const [correlationId, setCorrelationId] = useState(null);
  const [response,      setResponse]      = useState(null);
  const [error,         setError]         = useState(null);
  const [log,           setLog]           = useState([]);

  const addLog = useCallback((msg, type = "info") => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLog(prev => [{ id: Date.now() + Math.random(), ts, msg, type }, ...prev.slice(0, 49)]);
  }, []);

  const requestRide = useCallback(async ({ riderId, pickup, dropoff, rideType }) => {
    setError(null);
    setState("requesting");
    addLog(`Requesting ride — ${riderId}`);

    try {
      const res = await fetch(`${API_BASE}/ride/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rider_id:  riderId,
          pickup:    { address: pickup.address,  lat: pickup.lat,  lng: pickup.lng },
          dropoff:   { address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng },
          ride_type: rideType,
        }),
      });

      const data = await res.json();
      setResponse(data);

      if (res.ok) {
        const cid = data.correlation_id || data.ride_id || `ride_${Date.now()}`;
        setCorrelationId(cid);
        setState("requested");
        addLog(`Accepted — ${cid}`, "success");
      } else {
        setState("failed");
        setError(data.detail || JSON.stringify(data));
        addLog(`Failed — ${data.detail || res.status}`, "error");
      }
    } catch (e) {
      setState("failed");
      setError(`Cannot reach ${API_BASE}. Is docker running?`);
      addLog(`Network error — ${e.message}`, "error");
    }
  }, [addLog]);

  const cancelRide = useCallback(async ({ riderId, reason }) => {
    if (!correlationId) return;
    setState("requesting");
    addLog(`Cancelling — ${reason}`);

    try {
      const res = await fetch(`${API_BASE}/ride/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rider_id: riderId, correlation_id: correlationId, reason }),
      });

      const data = await res.json();
      setResponse(data);

      if (res.ok) {
        setState("cancelled");
        addLog("Ride cancelled", "success");
      } else {
        setState("failed");
        setError(data.detail || JSON.stringify(data));
        addLog(`Cancel failed — ${data.detail || res.status}`, "error");
      }
    } catch (e) {
      setState("failed");
      setError(`Cannot reach ${API_BASE}. Is docker running?`);
      addLog(`Network error — ${e.message}`, "error");
    }
  }, [correlationId, addLog]);

  const reset = useCallback(() => {
    setState("idle");
    setCorrelationId(null);
    setResponse(null);
    setError(null);
    addLog("— reset —", "muted");
  }, [addLog]);

  return { state, correlationId, response, error, log, requestRide, cancelRide, reset };
}
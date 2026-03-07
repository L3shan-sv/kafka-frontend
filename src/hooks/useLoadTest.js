import { useState, useRef, useCallback } from "react";
import { API_BASE, LOCATIONS, RIDE_TYPES, CANCEL_REASONS } from "../constants";

const rand  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid   = ()    => `user_${Math.floor(Math.random() * 1_000_000)}`;

export function useLoadTest() {
  const [running,  setRunning]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [live,     setLive]     = useState({ sent: 0, success: 0, failed: 0, cancelled: 0, errors: 0 });
  const [results,  setResults]  = useState(null);
  const abortRef = useRef(false);

  const run = useCallback(async ({ concurrency, totalRides, includeCancels, cancelRate }) => {
    setRunning(true);
    setResults(null);
    setProgress(0);
    abortRef.current = false;

    const stats = { sent: 0, success: 0, failed: 0, cancelled: 0, errors: 0, latencies: [] };
    const startTs = Date.now();

    const doOne = async () => {
      const riderId = uid();
      const pickup  = rand(LOCATIONS);
      let dropoff   = rand(LOCATIONS);
      while (dropoff.address === pickup.address) dropoff = rand(LOCATIONS);

      const t0 = performance.now();
      try {
        const res = await fetch(`${API_BASE}/ride/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rider_id:  riderId,
            pickup:    { address: pickup.address,  lat: pickup.lat,  lng: pickup.lng },
            dropoff:   { address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng },
            ride_type: rand(RIDE_TYPES).id,
          }),
        });
        stats.latencies.push(performance.now() - t0);
        const data = await res.json();
        stats.sent++;

        if (res.ok) {
          stats.success++;
          if (includeCancels && Math.random() * 100 < cancelRate) {
            const cid = data.correlation_id || data.ride_id;
            if (cid) {
              try {
                await fetch(`${API_BASE}/ride/cancel`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ rider_id: riderId, correlation_id: cid, reason: rand(CANCEL_REASONS).id }),
                });
                stats.cancelled++;
              } catch (_) {}
            }
          }
        } else {
          stats.failed++;
        }
      } catch (_) {
        stats.errors++;
        stats.sent++;
      }
    };

    let completed = 0;
    const batches = Math.ceil(totalRides / concurrency);

    for (let b = 0; b < batches && !abortRef.current; b++) {
      const size = Math.min(concurrency, totalRides - b * concurrency);
      await Promise.allSettled(Array.from({ length: size }, doOne));
      completed += size;
      setProgress(Math.round((completed / totalRides) * 100));
      setLive({ ...stats });
    }

    const elapsed = (Date.now() - startTs) / 1000;
    const sorted  = [...stats.latencies].sort((a, b) => a - b);
    const pct     = (p) => (sorted[Math.floor(sorted.length * p)] ?? 0).toFixed(0);

    setResults({
      ...stats,
      elapsed:     elapsed.toFixed(2),
      rps:         (stats.sent / elapsed).toFixed(1),
      successRate: ((stats.success / (stats.sent || 1)) * 100).toFixed(1),
      avg: (sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1)).toFixed(0),
      p50: pct(0.50),
      p95: pct(0.95),
      p99: pct(0.99),
    });

    setRunning(false);
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
    setRunning(false);
  }, []);

  return { running, progress, live, results, run, abort };
}
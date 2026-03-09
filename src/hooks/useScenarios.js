import { useState, useRef, useCallback } from "react";
import { API_BASE, LOCATIONS, RIDE_TYPES, CANCEL_REASONS } from "../constants";

// ── Config ────────────────────────────────────────────────────────────────────
const ANALYTICS_BASE = "http://localhost:8005";
const POLL_INTERVAL  = 2000; // ms

// ── Helpers ───────────────────────────────────────────────────────────────────
const rand  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid   = ()    => `user_${Math.floor(Math.random() * 1_000_000)}`;
const sleep = (ms)  => new Promise(r => setTimeout(r, ms));

function makeLogger(setLogs) {
  return (service, level, message, meta = {}) => {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), ts, service, level, message, meta }]);
  };
}

const ALL_SERVICES = ["ride-request", "driver-match", "payment", "notification", "analytics", "kafka", "redis"];
const allHealthy   = () => Object.fromEntries(ALL_SERVICES.map(s => [s, "healthy"]));

// ── Stats fetcher ─────────────────────────────────────────────────────────────
async function fetchStats() {
  const res = await fetch(`${ANALYTICS_BASE}/stats`);
  if (!res.ok) throw new Error(`stats HTTP ${res.status}`);
  return res.json();
}

// ── Health checker ────────────────────────────────────────────────────────────
async function checkHealth(setHealth) {
  const endpoints = {
    "ride-request": `${API_BASE}/health`,
    "analytics":    `${ANALYTICS_BASE}/health`,
  };
  const next = allHealthy();
  await Promise.allSettled(
    Object.entries(endpoints).map(async ([svc, url]) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
        next[svc] = r.ok ? "healthy" : "down";
      } catch {
        next[svc] = "down";
      }
    })
  );
  setHealth(next);
}

// ─────────────────────────────────────────────────────────────────────────────
// HAPPY PATH — fires a real ride, polls /stats until completion
// ─────────────────────────────────────────────────────────────────────────────
async function runHappyPath(log, setRideState, setHealth, signal) {
  setHealth(allHealthy());
  setRideState("idle");

  const riderId = uid();
  const pickup  = LOCATIONS[0]; // Times Square
  const dropoff = LOCATIONS[1]; // JFK

  // ── 1. POST /ride/request ──────────────────────────────────────────────────
  log("ride-request", "INFO", `POST /ride/request`, { rider_id: riderId });
  await sleep(100);

  const res = await fetch(`${API_BASE}/ride/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rider_id:  riderId,
      pickup:    { address: pickup.address,  lat: pickup.lat,  lng: pickup.lng },
      dropoff:   { address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng },
      ride_type: "standard",
    }),
    signal,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

  const cid = data.correlation_id;
  log("ride-request", "INFO", `→ 202 Accepted`, { correlation_id: cid, event_id: data.event_id });
  log("kafka", "INFO", `PRODUCE ride.requested → partition_key=${riderId}`);
  setRideState("requested");

  // ── 2. Snapshot baseline stats ────────────────────────────────────────────
  let baseline;
  try { baseline = await fetchStats(); } catch { baseline = null; }

  const base = {
    completed: baseline?.rides?.completed_today  ?? 0,
    dlq:       baseline?.rides?.sent_to_dlq      ?? 0,
    accepts:   baseline?.drivers?.accepts_today  ?? 0,
    declines:  baseline?.drivers?.declines_today ?? 0,
    active:    baseline?.rides?.active_now       ?? 0,
    revenue:   baseline?.revenue?.total_today_usd ?? 0,
  };

  log("analytics", "INFO", `Baseline snapshot — completed=${base.completed} active=${base.active} revenue=$${base.revenue.toFixed(2)}`);

  // ── 3. Poll until completed or DLQ ───────────────────────────────────────
  let elapsed = 0;
  const MAX_WAIT = 60000; // 60s timeout
  let matched  = false;
  let accepted = false;
  let started  = false;

  while (elapsed < MAX_WAIT) {
    if (signal.aborted) return;
    await sleep(POLL_INTERVAL);
    elapsed += POLL_INTERVAL;

    let s;
    try { s = await fetchStats(); } catch { continue; }

    const cur = {
      completed: s.rides.completed_today,
      dlq:       s.rides.sent_to_dlq,
      accepts:   s.drivers.accepts_today,
      declines:  s.drivers.declines_today,
      active:    Math.max(s.rides.active_now, 0),
      revenue:   s.revenue.total_today_usd,
    };

    // Detect driver matched (active rides went up)
    if (!matched && cur.active > base.active) {
      matched = true;
      setRideState("matched");
      log("driver-match", "INFO", `CONSUME ride.requested → find_nearby_driver() → driver found`);
      log("kafka", "INFO", `PRODUCE ride.driver_matched`);
      log("notification", "INFO", `PUSH rider: "Driver is on the way"`);
    }

    // Detect driver accepted (accepts counter went up)
    if (!accepted && cur.accepts > base.accepts) {
      accepted = true;
      setRideState("accepted");
      log("driver-match", "INFO", `driver_accepts() → True`);
      log("kafka", "INFO", `PRODUCE ride.driver_accepted`);
      log("notification", "INFO", `PUSH rider + driver: "Ride accepted"`);
      log("analytics", "INFO", `INCR driver_accepts_today → ${cur.accepts}`);
    }

    // Detect ride started (still active, accepted)
    if (!started && accepted && cur.active > 0) {
      started = true;
      setRideState("started");
      log("driver-match", "INFO", `simulate_ride() → PRODUCE ride.started`);
      log("redis", "INFO", `SET ride:${cid}:state = "started"`);
      log("notification", "INFO", `PUSH rider + driver: "Ride in progress"`);
    }

    // Detect DLQ (retries exhausted)
    if (cur.dlq > base.dlq) {
      setRideState("dlq");
      log("driver-match", "ERROR", `retry_count=5 == MAX_RETRIES=5 → routing to ride.DLQ`);
      log("kafka", "INFO", `PRODUCE ride.DLQ`, { correlation_id: cid, reason: "max_retries_exceeded" });
      log("notification", "INFO", `PUSH rider: "No drivers available. Try again soon."`);
      log("analytics", "INFO", `INCR rides_dlq_today → ${cur.dlq}`);
      return;
    }

    // Detect ride completed
    if (cur.completed > base.completed) {
      const fare = (cur.revenue - base.revenue).toFixed(2);
      setRideState("completed");
      log("driver-match", "INFO", `Ride complete → PRODUCE ride.completed`, { fare: `$${fare}` });
      log("redis", "INFO", `SET ride:${cid}:state = "completed"`);
      log("notification", "INFO", `PUSH rider + driver: "Ride complete! Thanks for riding"`);
      log("analytics", "INFO", `INCR rides_completed_today → ${cur.completed}, revenue += $${fare}`);
      await sleep(500);
      log("payment", "INFO", `CONSUME ride.completed → simulate_payment($${fare}) → SUCCESS`);
      log("kafka", "INFO", `PRODUCE payment.charged`, { amount: `$${fare}`, correlation_id: cid });
      log("notification", "INFO", `EMAIL receipt to rider: $${fare}`);
      log("analytics", "INFO", `INCR payments_charged_today, revenue_today=${cur.revenue.toFixed(2)}`);
      return;
    }

    // Declines accumulating — inform user
    if (cur.declines > base.declines && !accepted) {
      const newDeclines = cur.declines - base.declines;
      log("driver-match", "WARN", `driver_accepts() → False — driver declined (attempt ${newDeclines})`);
      log("kafka", "INFO", `PRODUCE ride.driver_declined retry_count=${newDeclines}`);
      log("notification", "INFO", `PUSH rider: "Finding another driver…"`);
      // Update baseline for declines so we log each new one
      base.declines = cur.declines;
    }
  }

  log("system", "WARN", `Timeout after ${MAX_WAIT / 1000}s — check docker logs for driver-match-service`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DLQ PATH — fires a real ride and watches sent_to_dlq increment
// Simulates low accept rate by firing multiple rides until one DLQs
// ─────────────────────────────────────────────────────────────────────────────
async function runDLQPath(log, setRideState, setRetryCount, setHealth, signal) {
  setHealth(allHealthy());
  setRideState("idle");
  setRetryCount(0);

  // Snapshot baseline
  let baseline;
  try { baseline = await fetchStats(); } catch { baseline = null; }
  const baseDlq      = baseline?.rides?.sent_to_dlq      ?? 0;
  const baseDeclines = baseline?.drivers?.declines_today  ?? 0;
  const baseCompleted= baseline?.rides?.completed_today   ?? 0;

  log("ride-request", "INFO", `DLQ scenario — firing ride (75% driver accept, 5 max retries)`);
  log("system", "INFO", `Watching for ride.DLQ event from real driver-match-service`);

  // Fire the ride
  const riderId = uid();
  const res = await fetch(`${API_BASE}/ride/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rider_id:  riderId,
      pickup:    { address: "Central Park, NY",    lat: 40.7851, lng: -73.9683 },
      dropoff:   { address: "Brooklyn Bridge, NY", lat: 40.7061, lng: -73.9969 },
      ride_type: "standard",
    }),
    signal,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  const cid = data.correlation_id;

  log("ride-request", "INFO", `→ 202 Accepted`, { correlation_id: cid });
  log("kafka", "INFO", `PRODUCE ride.requested → partition_key=${riderId}`);
  setRideState("requested");

  // Poll until DLQ or completed (if driver accepts)
  let elapsed = 0;
  let lastDeclines = baseDeclines;
  let attempt = 0;

  while (elapsed < 90000) {
    if (signal.aborted) return;
    await sleep(POLL_INTERVAL);
    elapsed += POLL_INTERVAL;

    let s;
    try { s = await fetchStats(); } catch { continue; }

    const curDeclines  = s.drivers.declines_today;
    const curDlq       = s.rides.sent_to_dlq;
    const curCompleted = s.rides.completed_today;

    // New decline detected
    if (curDeclines > lastDeclines) {
      attempt++;
      setRetryCount(attempt);
      setRideState("matched");
      log("driver-match", "INFO", `CONSUME ride.requested retry_count=${attempt - 1}`);
      log("driver-match", "WARN", `driver_accepts() → False — driver ${`drv_${Math.random().toString(36).slice(2,7)}`} declined`);
      log("kafka", "INFO", `PRODUCE ride.driver_declined retry_count=${attempt}`);
      log("notification", "INFO", `PUSH rider: "Finding another driver…"`);
      await sleep(300);
      setRideState("requested");
      if (attempt < 5) {
        log("driver-match", "INFO", `retry_count=${attempt} < MAX_RETRIES=5 → re-queuing ride.requested`);
      }
      lastDeclines = curDeclines;
    }

    // DLQ detected — this ride or a concurrent one hit max retries
    if (curDlq > baseDlq) {
      setRetryCount(5);
      setRideState("dlq");
      log("driver-match", "ERROR", `retry_count=5 == MAX_RETRIES=5 → routing to ride.DLQ`);
      log("kafka", "INFO", `PRODUCE ride.DLQ`, { correlation_id: cid, reason: "max_retries_exceeded" });
      log("notification", "INFO", `PUSH rider: "No drivers available. Try again soon."`);
      log("analytics", "INFO", `INCR rides_dlq_today → ${curDlq}`);
      log("driver-match", "INFO", `DLQ event preserved — 7-day Kafka retention for ops review`);
      return;
    }

    // Driver accepted — this ride completed instead
    if (curCompleted > baseCompleted) {
      log("system", "INFO", `Driver accepted this ride — not a DLQ. Fire again for guaranteed DLQ.`);
      log("system", "INFO", `Tip: DLQ probability = (0.25)^5 ≈ 0.1% per ride. Fire load test to see DLQ.`);
      setRideState("completed");
      return;
    }
  }

  log("system", "WARN", "DLQ scenario timed out — try firing more rides");
}

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE SCENARIOS — animated log sequences (no real API calls needed)
// These demonstrate what WOULD happen in production
// ─────────────────────────────────────────────────────────────────────────────
async function runFailure(id, log, setHealth) {
  setHealth(allHealthy());
  const downAt = new Date().toISOString().replace("T", " ").slice(0, 23);

  const otherServicesHealthy = async () => {
    await sleep(100);
    for (const svc of ["ride-request", "driver-match", "notification", "analytics", "kafka", "redis"]) {
      if (svc === "payment"      && id === "payment_down")      continue;
      if (svc === "kafka"        && id === "kafka_down")         continue;
      if (svc === "redis"        && id === "redis_down")         continue;
      if (svc === "driver-match" && id === "driver_match_down")  continue;
      log(svc, "INFO", `Health check OK — unaffected by failure`);
      await sleep(60);
    }
  };

  if (id === "payment_down") {
    log("payment", "INFO",  `Health check OK — processing ride.completed normally`);
    await sleep(400);
    log("payment", "ERROR", `HEALTH CHECK FAILED at ${downAt} — pod unresponsive`);
    setHealth(h => ({ ...h, payment: "down" }));
    log("payment", "ERROR", `Pod crash — consumer lifecycle thread lost`);
    await sleep(200);
    await otherServicesHealthy();
    await sleep(300);
    log("kafka", "WARN",  `consumer_lag{group=payment-service-group topic=ride.completed} = 47`);
    await sleep(400);
    log("kafka", "WARN",  `consumer_lag{group=payment-service-group topic=ride.completed} = 134`);
    await sleep(200);
    log("payment", "ERROR", `ALERT: consumer_lag > 100 → PagerDuty P1 triggered`);
    log("system", "INFO",  `Run: docker kill rideflow-payment  ← try it live!`);
    await sleep(800);
    log("payment", "INFO",  `Kubernetes liveness probe failed → scheduling pod replacement`);
    await sleep(700);
    const upAt = new Date().toISOString().replace("T", " ").slice(0, 23);
    setHealth(h => ({ ...h, payment: "recovering" }));
    log("payment", "INFO",  `Pod restarted at ${upAt} — consumer group rejoined`);
    await sleep(300);
    log("payment", "INFO",  `Resuming from last committed offset — no events lost`);
    await sleep(300);
    log("payment", "INFO",  `Processing backlog: 134 ride.completed events`);
    await sleep(400);
    log("payment", "INFO",  `Redis SET NX idempotency checks passing — zero double charges`);
    await sleep(300);
    log("payment", "INFO",  `Backlog cleared — all delayed payments processed`);
    setHealth(h => ({ ...h, payment: "healthy" }));
    log("payment", "INFO",  `HEALTH CHECK OK — fully recovered`);

  } else if (id === "kafka_down") {
    log("kafka", "INFO",  `Broker kafka:29092 healthy — all producers/consumers connected`);
    await sleep(400);
    log("kafka", "ERROR", `HEALTH CHECK FAILED at ${downAt} — broker-1 unreachable`);
    setHealth(h => ({ ...h, kafka: "down" }));
    log("ride-request", "ERROR", `KafkaException: Unable to produce ride.requested`);
    log("driver-match", "ERROR", `KafkaException: Consumer poll failed`);
    log("payment",      "ERROR", `KafkaException: Consumer poll failed`);
    await sleep(200);
    log("ride-request", "ERROR", `POST /ride/request → 500 Internal Server Error`);
    await sleep(300);
    log("kafka", "WARN", `MSK promoting partition leaders to surviving broker`);
    log("kafka", "WARN", `replication-factor=1 (dev) — partitions temporarily unavailable`);
    log("kafka", "ERROR", `ALERT: All producer publish failures → PagerDuty P1`);
    log("system", "INFO", `Run: docker kill rideflow-kafka  ← try it live!`);
    await sleep(900);
    const upAt = new Date().toISOString().replace("T", " ").slice(0, 23);
    log("kafka", "INFO", `Broker-1 recovered at ${upAt}`);
    setHealth(h => ({ ...h, kafka: "recovering" }));
    await sleep(300);
    log("ride-request", "INFO", `Producer reconnected — resuming ride.requested publishing`);
    log("driver-match", "INFO", `Consumer reconnected — resuming from last committed offset`);
    log("payment",      "INFO", `Consumer reconnected — resuming from last committed offset`);
    await sleep(300);
    log("kafka", "INFO", `All consumers reconnected. No events lost (at-least-once delivery).`);
    setHealth(h => ({ ...h, kafka: "healthy" }));
    log("kafka", "INFO", `HEALTH CHECK OK — fully recovered`);

  } else if (id === "redis_down") {
    log("redis", "INFO",  `Health check OK — ping 0.3ms`);
    await sleep(400);
    log("redis", "ERROR", `HEALTH CHECK FAILED at ${downAt} — ElastiCache node unreachable`);
    setHealth(h => ({ ...h, redis: "down" }));
    log("driver-match", "ERROR", `RedisError: idempotency check failed — duplicate processing risk`);
    log("payment",      "ERROR", `RedisError: cancel lock unavailable — safe-fail activated`);
    log("ride-request", "ERROR", `RedisError: GET ride state failed → /ride/cancel returning 503`);
    await sleep(200);
    log("payment",   "WARN", `Safe-fail: routing all cancellations to payment.DLQ`);
    log("analytics", "WARN", `Redis INCR unavailable — counters frozen`);
    log("redis",     "ERROR", `ALERT: redis_ping_success=0 → PagerDuty P1 triggered`);
    log("system", "INFO", `Run: docker kill rideflow-redis  ← try it live!`);
    await sleep(100);
    await otherServicesHealthy();
    await sleep(800);
    const upAt = new Date().toISOString().replace("T", " ").slice(0, 23);
    log("redis", "INFO", `Replica promoted at ${upAt}`);
    setHealth(h => ({ ...h, redis: "recovering" }));
    await sleep(300);
    log("driver-match", "INFO", `Redis reconnected — idempotency checks resuming`);
    log("payment",      "INFO", `Redis reconnected — cancel locks available`);
    log("analytics",    "INFO", `Redis reconnected — counters resuming`);
    await sleep(300);
    log("payment", "INFO", `DLQ events replayed by ops — no double charges`);
    setHealth(h => ({ ...h, redis: "healthy" }));
    log("redis", "INFO", `HEALTH CHECK OK — fully recovered`);

  } else if (id === "driver_match_down") {
    log("driver-match", "INFO",  `Health check OK — consuming ride.requested normally`);
    await sleep(400);
    log("driver-match", "ERROR", `HEALTH CHECK FAILED at ${downAt} — pod crash`);
    setHealth(h => ({ ...h, "driver-match": "down" }));
    log("driver-match", "ERROR", `Lifecycle threads lost — in-flight rides stuck in Redis`);
    await sleep(200);
    await otherServicesHealthy();
    await sleep(300);
    log("kafka", "WARN", `consumer_lag{group=driver-match-service-group topic=ride.requested} = 23`);
    await sleep(400);
    log("kafka", "WARN", `consumer_lag{group=driver-match-service-group topic=ride.requested} = 89`);
    log("driver-match", "WARN", `KNOWN GAP: rides stuck in "started" state — TTL watchdog needed`);
    log("system", "INFO", `Run: docker kill rideflow-driver-match  ← try it live!`);
    await sleep(700);
    log("driver-match", "INFO", `Kubernetes restarting pod — same consumer group.id`);
    await sleep(700);
    const upAt = new Date().toISOString().replace("T", " ").slice(0, 23);
    setHealth(h => ({ ...h, "driver-match": "recovering" }));
    log("driver-match", "INFO", `Pod restarted at ${upAt}`);
    await sleep(300);
    log("driver-match", "INFO", `Consumer rejoined — resuming from last committed offset`);
    log("driver-match", "INFO", `Processing backlog: 89 ride.requested events`);
    await sleep(400);
    log("kafka", "INFO", `consumer_lag{group=driver-match-service-group topic=ride.requested} = 0`);
    setHealth(h => ({ ...h, "driver-match": "healthy" }));
    log("driver-match", "INFO", `HEALTH CHECK OK — fully recovered`);

  } else if (id === "simultaneous_cancel") {
    // Fire a real ride first, then cancel it
    const riderId = uid();
    log("ride-request", "INFO", `Firing real ride for simultaneous cancel demo`);

    let cid = `ride_${Math.random().toString(36).slice(2, 11)}`;
    try {
      const res = await fetch(`${API_BASE}/ride/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rider_id: riderId,
          pickup:  { address: "Times Square, NY", lat: 40.7580, lng: -73.9855 },
          dropoff: { address: "JFK Airport, NY",  lat: 40.6413, lng: -73.7781 },
          ride_type: "standard",
        }),
      });
      const d = await res.json();
      if (res.ok) cid = d.correlation_id;
    } catch (_) {}

    log("ride-request", "INFO",  `Ride ${cid} in state "started"`);
    await sleep(300);
    log("ride-request", "INFO",  `Rider POST /ride/cancel received`, { rider_id: riderId, correlation_id: cid });
    await sleep(60);
    log("driver-match", "INFO",  `Driver cancel signal received simultaneously`, { correlation_id: cid });
    await sleep(100);
    log("ride-request", "INFO",  `Redis SET ride:${cid}:state = "cancelled" NX → SUCCESS (rider wins lock)`);
    await sleep(80);
    log("driver-match", "WARN",  `Redis SET ride:${cid}:state = "cancelled" NX → FAIL (key exists)`);
    await sleep(100);
    log("ride-request", "INFO",  `PRODUCE ride.cancelled_by_rider cancel_stage="after_pickup"`);
    log("driver-match", "INFO",  `PRODUCE ride.cancelled_by_driver (audit trail only)`);
    await sleep(300);
    log("payment", "INFO",  `CONSUME ride.cancelled_by_rider offset=12`);
    await sleep(100);
    log("payment", "INFO",  `Redis SET payment-service:cancel_lock:${cid} NX → SUCCESS`);
    await sleep(100);
    log("payment", "INFO",  `cancel_stage="after_pickup" → fee=$5.00 → charging rider`);
    log("payment", "INFO",  `PRODUCE payment.cancellation_charged $5.00`);
    await sleep(200);
    log("payment", "INFO",  `CONSUME ride.cancelled_by_driver offset=13`);
    await sleep(100);
    log("payment", "WARN",  `Redis SET payment-service:cancel_lock:${cid} NX → FAIL (lock exists)`);
    log("payment", "INFO",  `Second cancel event dropped cleanly — no charge attempted`);
    await sleep(200);
    log("payment", "INFO",  `Result: $5.00 charged exactly once. Both events in Kafka for audit.`);
    log("payment", "INFO",  `Race condition resolved by Redis atomic NX lock. Zero double charges.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD TEST — real concurrent requests + live stats polling
// ─────────────────────────────────────────────────────────────────────────────
async function runLoadTest(log, setLoadStats, setHealth, abortRef) {
  const TOTAL       = 100;  // sensible default; user can override via useLoadTest
  const CONCURRENCY = 20;

  setHealth(allHealthy());

  let baseline;
  try { baseline = await fetchStats(); } catch { baseline = null; }
  const baseRevenue   = baseline?.revenue?.total_today_usd  ?? 0;
  const baseCompleted = baseline?.rides?.completed_today    ?? 0;

  const stats = {
    sent: 0, success: 0, failed: 0, errors: 0,
    latencies: [],
  };
  const startTs = Date.now();

  log("load-test", "INFO", `Starting load test — total=${TOTAL} concurrency=${CONCURRENCY}`);
  log("system",    "INFO", `Baseline: completed=${baseCompleted} revenue=$${baseRevenue.toFixed(2)}`);

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
      stats.sent++;
      if (res.ok) stats.success++;
      else stats.failed++;
    } catch {
      stats.errors++;
      stats.sent++;
    }
  };

  const batches = Math.ceil(TOTAL / CONCURRENCY);

  // Stats poller running in parallel
  let pollStats = true;
  const statsPollLoop = async () => {
    while (pollStats) {
      await sleep(3000);
      if (!pollStats) break;
      try {
        const s = await fetchStats();
        const newCompleted = s.rides.completed_today - baseCompleted;
        const newRevenue   = (s.revenue.total_today_usd - baseRevenue).toFixed(2);
        log("analytics", "INFO",
          `live — completed=${newCompleted} revenue=+$${newRevenue} active=${Math.max(s.rides.active_now,0)} dlq=${s.rides.sent_to_dlq}`
        );
      } catch (_) {}
    }
  };
  statsPollLoop();

  for (let b = 0; b < batches; b++) {
    if (abortRef.current) {
      log("load-test", "WARN", `Aborted at batch ${b}/${batches} — ${stats.sent} requests sent`);
      break;
    }

    const size = Math.min(CONCURRENCY, TOTAL - b * CONCURRENCY);
    await Promise.allSettled(Array.from({ length: size }, doOne));

    const elapsed = (Date.now() - startTs) / 1000;
    const sorted  = [...stats.latencies].sort((a, b) => a - b);
    const pct     = p => +(sorted[Math.floor(sorted.length * p)] ?? 0).toFixed(0);

    setLoadStats({
      ...stats,
      progress:    Math.round(((b + 1) / batches) * 100),
      elapsed:     elapsed.toFixed(1),
      rps:         (stats.sent / elapsed).toFixed(1),
      successRate: ((stats.success / (stats.sent || 1)) * 100).toFixed(1),
      p50: pct(0.50), p95: pct(0.95), p99: pct(0.99),
    });

    if (b % 5 === 0 && b > 0) {
      const lvl = stats.errors > stats.sent * 0.05 ? "WARN" : "INFO";
      log("ride-request", lvl, `batch ${b+1}/${batches} — sent=${stats.sent} success=${stats.success} rps=${(stats.sent/((Date.now()-startTs)/1000)).toFixed(1)}`);
    }
  }

  pollStats = false;

  // Final stats snapshot
  let final;
  try { final = await fetchStats(); } catch { final = null; }
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);

  log("load-test", "INFO", `Requests done in ${elapsed}s — sent=${stats.sent} success=${stats.success} failed=${stats.failed}`);

  if (final) {
    const deltaCompleted = final.rides.completed_today - baseCompleted;
    const deltaRevenue   = (final.revenue.total_today_usd - baseRevenue).toFixed(2);
    const deltaDlq       = final.rides.sent_to_dlq - (baseline?.rides?.sent_to_dlq ?? 0);
    log("analytics", "INFO", `Platform delta — completed=+${deltaCompleted} revenue=+$${deltaRevenue} dlq=+${deltaDlq}`);
    log("analytics", "INFO", `Services still processing async — watch stats grow for next 30s`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function useScenarios() {
  const [activeScenario, setActiveScenario] = useState(null);
  const [running,        setRunning]        = useState(false);
  const [logs,           setLogs]           = useState([]);
  const [rideState,      setRideState]      = useState("idle");
  const [retryCount,     setRetryCount]     = useState(0);
  const [loadStats,      setLoadStats]      = useState(null);
  const [activeFailure,  setActiveFailure]  = useState(null);
  const [health,         setHealth]         = useState(allHealthy());
  const [error,          setError]          = useState(null);

  const abortRef     = useRef(false);
  const abortCtrlRef = useRef(null);
  const log = useCallback(makeLogger(setLogs), []);

  const reset = useCallback(() => {
    abortRef.current = true;
    abortCtrlRef.current?.abort();
    setRunning(false); setLogs([]); setRideState("idle");
    setRetryCount(0);  setLoadStats(null); setError(null);
    setHealth(allHealthy());
  }, []);

  const startScenario = useCallback(async (scenarioId, failureId = null) => {
    abortRef.current = true;
    abortCtrlRef.current?.abort();
    await sleep(50);

    abortRef.current     = false;
    abortCtrlRef.current = new AbortController();

    setActiveScenario(scenarioId); setActiveFailure(failureId);
    setRunning(true); setLogs([]); setRideState("idle");
    setRetryCount(0); setLoadStats(null); setError(null);
    setHealth(allHealthy());

    try {
      if      (scenarioId === "happy")    await runHappyPath(log, setRideState, setHealth, abortCtrlRef.current.signal);
      else if (scenarioId === "dlq")      await runDLQPath(log, setRideState, setRetryCount, setHealth, abortCtrlRef.current.signal);
      else if (scenarioId === "load")     await runLoadTest(log, setLoadStats, setHealth, abortRef);
      else if (scenarioId === "failures" && failureId) await runFailure(failureId, log, setHealth);
    } catch (e) {
      if (e.name !== "AbortError") { setError(e.message); log("system", "ERROR", e.message); }
    } finally {
      setRunning(false);
    }
  }, [log]);

  const abort = useCallback(() => {
    abortRef.current = true;
    abortCtrlRef.current?.abort();
    setRunning(false);
    log("system", "WARN", "Scenario aborted by user");
  }, [log]);

  return {
    activeScenario, running, logs, rideState, retryCount,
    loadStats, activeFailure, health, error,
    startScenario, abort, reset, setActiveScenario,
  };
}
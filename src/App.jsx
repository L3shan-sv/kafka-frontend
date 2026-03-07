import { useState } from "react";
import Header          from "./components/Header";
import StatusBadge     from "./components/StatusBadge";
import RideForm        from "./components/RideForm";
import ResponseViewer  from "./components/ResponseViewer";
import LoadTestConfig  from "./components/LoadTestConfig";
import LoadTestResults from "./components/LoadTestResults";
import { useRide }     from "./hooks/useRide";
import { useLoadTest } from "./hooks/useLoadTest";

export default function App() {
  const [tab, setTab] = useState("single");

  const ride     = useRide();
  const loadTest = useLoadTest();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header activeTab={tab} onTabChange={setTab} />

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">

        {/* ── SINGLE RIDE ─────────────────────────────────────── */}
        {tab === "single" && (
          <div className="flex gap-5 h-full">

            {/* Left column — controls */}
            <div className="w-80 flex-shrink-0 flex flex-col gap-4">
              <StatusBadge
                state={ride.state}
                correlationId={ride.correlationId}
              />
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex-1">
                <RideForm
                  rideState={ride.state}
                  onRequest={ride.requestRide}
                  onCancel={ride.cancelRide}
                  onReset={ride.reset}
                />
              </div>
            </div>

            {/* Right column — response + log */}
            <div className="flex-1 flex flex-col gap-4 min-h-0" style={{ minHeight: "calc(100vh - 120px)" }}>
              <ResponseViewer
                response={ride.response}
                log={ride.log}
                error={ride.error}
              />
            </div>

          </div>
        )}

        {/* ── LOAD TEST ────────────────────────────────────────── */}
        {tab === "load" && (
          <div className="flex gap-5">

            {/* Left — config */}
            <div className="w-80 flex-shrink-0">
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                <p className="text-[11px] font-medium text-white/25 uppercase tracking-widest mb-5">
                  Configuration
                </p>
                <LoadTestConfig
                  running={loadTest.running}
                  onRun={loadTest.run}
                  onAbort={loadTest.abort}
                />
              </div>
            </div>

            {/* Right — results */}
            <div className="flex-1">
              {(loadTest.running || loadTest.results) ? (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
                  <p className="text-[11px] font-medium text-white/25 uppercase tracking-widest mb-5">
                    Results
                  </p>
                  <LoadTestResults
                    running={loadTest.running}
                    progress={loadTest.progress}
                    live={loadTest.live}
                    results={loadTest.results}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center min-h-64
                  bg-white/[0.01] border border-white/5 rounded-xl border-dashed">
                  <p className="text-white/15 text-sm">Configure and run a test to see results</p>
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
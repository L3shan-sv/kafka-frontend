export default function Header({ activeTab, onTabChange }) {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-8 h-14 border-b border-white/5 bg-black">

      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5"/>
            <path d="M8 12h8M14 9l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="text-white font-semibold tracking-tight">RideFlow</span>
        <span className="text-[10px] text-white/30 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full tracking-wide">
          DEV
        </span>
      </div>

      {/* Tabs */}
      <nav className="flex items-center bg-white/5 border border-white/8 rounded-lg p-1 gap-1">
        {[
          { id: "single",    label: "Single Ride"  },
          { id: "load",      label: "Load Test"    },
          { id: "scenarios", label: "Scenarios"    },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === id
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* API status */}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 anim-pulse" />
        <span className="font-mono-custom text-xs text-white/30">localhost:8001</span>
      </div>

    </header>
  );
}
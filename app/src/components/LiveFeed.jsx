import { useMemo, useRef, useEffect } from "react";

const PERSONA_LABEL = {
  stat_nerd: "Moe",
  color_commentator: "Zelda",
  barkley: "Davin",
};

function formatTimestamp(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    }) + " ET";
  } catch {
    return "";
  }
}

function EntryBubble({ entry }) {
  const isAlert = entry.entry_type === "alert";
  const persona = entry.persona || "stat_nerd";
  const label = PERSONA_LABEL[persona] || "Moe";
  const ts = formatTimestamp(entry.created_at);

  if (isAlert) {
    return (
      <div className="pl-3 pb-2.5 border-l-2 border-red-500/60 ml-1 mb-0.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 uppercase animate-pulse"
            style={{ fontFamily: "Space Mono, monospace" }}
          >
            Alert
          </span>
          <span className="font-bold text-orange-400 text-xs">{label}</span>
          {entry.leverage_pct != null && (
            <span className="text-[10px] text-red-400/70" style={{ fontFamily: "Space Mono, monospace" }}>
              {entry.leverage_pct}% swing
            </span>
          )}
        </div>
        <p className="text-sm text-red-100 font-medium leading-snug">{entry.content}</p>
        {ts && (
          <span className="text-[10px] text-slate-600 mt-0.5 block" style={{ fontFamily: "Space Mono, monospace" }}>
            {ts}
          </span>
        )}
      </div>
    );
  }

  return (
    <p className="text-sm text-slate-300 leading-snug pb-2 last:pb-0 border-b border-slate-800/30 last:border-0 mb-0">
      <span className="font-bold text-cyan-400">{label} —</span>{" "}
      {entry.content}
      {ts && (
        <span className="text-[10px] text-slate-600 ml-1.5 whitespace-nowrap" style={{ fontFamily: "Space Mono, monospace" }}>
          {ts}
        </span>
      )}
    </p>
  );
}

export default function LiveFeed({ entries, playerName, loading }) {
  const scrollRef = useRef(null);
  const prevCountRef = useRef(0);

  // Filter entries: show player-specific + pool-wide entries
  const filtered = useMemo(() => {
    if (!entries || !entries.length) return [];
    return entries.filter(
      (e) => e.player_name === "_pool" || e.player_name === playerName
    );
  }, [entries, playerName]);

  // Auto-scroll to top when new entries arrive
  useEffect(() => {
    if (filtered.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    prevCountRef.current = filtered.length;
  }, [filtered.length]);

  if (loading) {
    return (
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-800" />
          <div className="h-3 w-48 bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  if (!filtered.length) {
    return null;
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-2 border-b border-slate-800/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span
            className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold"
            style={{ fontFamily: "Space Mono, monospace" }}
          >
            Live Feed
          </span>
        </div>
        <span className="text-[10px] text-slate-600" style={{ fontFamily: "Space Mono, monospace" }}>
          {filtered.length} update{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Scrollable feed — compact: ~1.5 entries visible before scroll */}
      <div
        ref={scrollRef}
        className="px-5 py-3 overflow-y-auto"
        style={{ scrollBehavior: "smooth", maxHeight: 130 }}
      >
        {filtered.map((entry) => (
          <EntryBubble key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

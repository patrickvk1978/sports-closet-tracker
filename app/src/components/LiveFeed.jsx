import { useMemo, useRef, useEffect } from "react";

const PERSONA_ICON = {
  stat_nerd: "\u{1F4CA}",           // 📊
  color_commentator: "\u{1F399}",   // 🎙️
  barkley: "\u{1F525}",             // 🔥
};

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
  const icon = PERSONA_ICON[persona] || PERSONA_ICON.stat_nerd;
  const label = PERSONA_LABEL[persona] || "Stat";

  return (
    <div
      className={`relative pl-8 pb-4 ${
        isAlert ? "" : "border-l border-slate-800/50 ml-3"
      }`}
    >
      {/* Timeline dot / alert badge */}
      <div
        className={`absolute left-0 top-0.5 flex items-center justify-center rounded-full text-xs
          ${isAlert
            ? "w-7 h-7 -ml-0.5 bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse"
            : "w-6 h-6 -ml-0 bg-slate-800/80 border border-slate-700/50"
          }`}
        title={label}
      >
        {icon}
      </div>

      {/* Content */}
      <div className={`ml-2 ${isAlert ? "ml-3" : ""}`}>
        {isAlert && (
          <div className="flex items-center gap-2 mb-1">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 uppercase"
              style={{ fontFamily: "Space Mono, monospace" }}
            >
              Alert
            </span>
            {entry.leverage_pct != null && (
              <span className="text-[10px] text-red-400/70" style={{ fontFamily: "Space Mono, monospace" }}>
                {entry.leverage_pct}% swing
              </span>
            )}
          </div>
        )}

        <p
          className={`text-sm leading-relaxed ${
            isAlert ? "text-red-100 font-medium" : "text-slate-200"
          }`}
        >
          {entry.content}
        </p>

        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-[10px] text-slate-600"
            style={{ fontFamily: "Space Mono, monospace" }}
          >
            {formatTimestamp(entry.created_at)}
          </span>
          {entry.entry_type !== "alert" && (
            <span className="text-[10px] text-slate-700 capitalize">
              {entry.entry_type?.replace("_", " ")}
            </span>
          )}
        </div>
      </div>
    </div>
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
      <div className="px-5 py-3 border-b border-slate-800/40 flex items-center justify-between">
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

      {/* Scrollable feed */}
      <div
        ref={scrollRef}
        className="px-5 py-4 max-h-80 overflow-y-auto"
        style={{ scrollBehavior: "smooth" }}
      >
        {filtered.map((entry) => (
          <EntryBubble key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

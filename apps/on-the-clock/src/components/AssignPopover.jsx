import { useEffect, useMemo, useRef, useState } from "react";

/**
 * AssignPopover — per-Big-Board-row popover listing all 32 picks.
 *
 * Each row: Pick# · Team · needs · [prediction slot] · [watchlist (N/4)]
 * Two actions per row: "Set as prediction" | "Add to watchlist"
 */
export default function AssignPopover({
  prospect,              // Prospect being assigned
  picks,                 // [{ number, currentTeam }]
  teams,                 // { [teamCode]: { name, needs } }
  teamCodeForPick,       // (pickNumber) => teamCode
  livePredictions,       // { [pickNumber]: prospectId }
  watchlistsByTeam,      // { [teamCode]: prospectId[] }
  watchlistCapacity = 4,
  onSetPrediction,       // (pickNumber, prospectId) => void | Promise
  onAddToWatchlist,      // (teamCode, prospectId) => void | Promise
  onRemoveFromWatchlist, // (teamCode, prospectId) => void | Promise
  onClose,
  anchorRef,
}) {
  const ref = useRef(null);
  const [filter, setFilter] = useState("");

  // Close on outside click / escape
  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      if (anchorRef?.current && anchorRef.current.contains(e.target)) return;
      onClose?.();
    }
    function onKey(e) { if (e.key === "Escape") onClose?.(); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  const rows = useMemo(() => {
    const fnorm = filter.trim().toLowerCase();
    return picks
      .map((pick) => {
        const teamCode = teamCodeForPick ? teamCodeForPick(pick.number) : pick.currentTeam;
        const team = teams[teamCode] ?? {};
        const needs = team.needs ?? [];
        const predictedId = livePredictions?.[pick.number] ?? null;
        const wl = watchlistsByTeam?.[teamCode] ?? [];
        const onWatchlist = wl.includes(prospect?.id);
        const isPredicted = predictedId === prospect?.id;
        const matchesFilter = !fnorm
          || (team.name ?? "").toLowerCase().includes(fnorm)
          || String(pick.number).includes(fnorm)
          || (teamCode ?? "").toLowerCase().includes(fnorm)
          || needs.some((n) => n.toLowerCase().includes(fnorm));
        return { pick, team, teamCode, needs, predictedId, wl, onWatchlist, isPredicted, matchesFilter };
      })
      .filter((r) => r.matchesFilter);
  }, [picks, teams, teamCodeForPick, livePredictions, watchlistsByTeam, prospect, filter]);

  if (!prospect) return null;

  return (
    <div
      ref={ref}
      className="assign-popover"
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        right: 0,
        zIndex: 40,
        background: "var(--dn-card, #1b2230)",
        border: "1px solid var(--dn-border, #2a3341)",
        borderRadius: 10,
        padding: 8,
        width: 420,
        maxHeight: 480,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
        color: "var(--dn-text, #e6ebf2)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 6px" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--dn-muted, #8b95a6)" }}>
            Assign
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{prospect.name}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--dn-muted, #8b95a6)", cursor: "pointer", fontSize: 16 }}
        >
          ✕
        </button>
      </div>
      <input
        autoFocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by team, pick #, or need"
        style={{
          margin: "0 6px 6px",
          padding: "6px 8px",
          fontSize: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--dn-border, #2a3341)",
          borderRadius: 6,
          color: "inherit",
        }}
      />
      <div style={{ overflowY: "auto", flex: 1 }}>
        {rows.map(({ pick, team, teamCode, needs, wl, onWatchlist, isPredicted }) => {
          const wlFull = wl.length >= watchlistCapacity && !onWatchlist;
          return (
            <div
              key={pick.number}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr auto",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--dn-muted, #8b95a6)", textAlign: "right" }}>
                {pick.number}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {team.name ?? teamCode ?? "—"}
                </div>
                <div style={{ fontSize: 10, color: "var(--dn-muted, #8b95a6)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {needs.length ? <span>needs {needs.join(", ")}</span> : <span>—</span>}
                  {isPredicted ? <span style={{ color: "#5ee0a5" }}>· your prediction</span> : null}
                  {onWatchlist ? <span style={{ color: "#e0b65e" }}>· on watchlist</span> : null}
                  <span>· wl {wl.length}/{watchlistCapacity}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  disabled={isPredicted}
                  onClick={async () => {
                    await onSetPrediction?.(pick.number, prospect.id);
                    onClose?.();
                  }}
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 5,
                    border: "1px solid var(--dn-border, #2a3341)",
                    background: isPredicted ? "transparent" : "var(--dn-accent, #3b82f6)",
                    color: isPredicted ? "var(--dn-muted, #8b95a6)" : "white",
                    cursor: isPredicted ? "default" : "pointer",
                  }}
                >
                  {isPredicted ? "Predicted" : "Predict"}
                </button>
                {onWatchlist ? (
                  <button
                    type="button"
                    onClick={async () => { await onRemoveFromWatchlist?.(teamCode, prospect.id); }}
                    style={{
                      fontSize: 11, padding: "4px 8px", borderRadius: 5,
                      border: "1px solid var(--dn-border, #2a3341)",
                      background: "transparent", color: "var(--dn-muted, #8b95a6)", cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={wlFull}
                    onClick={async () => { await onAddToWatchlist?.(teamCode, prospect.id); }}
                    title={wlFull ? "Watchlist full (4 max)" : ""}
                    style={{
                      fontSize: 11, padding: "4px 8px", borderRadius: 5,
                      border: "1px solid var(--dn-border, #2a3341)",
                      background: "transparent",
                      color: wlFull ? "rgba(255,255,255,0.3)" : "inherit",
                      cursor: wlFull ? "not-allowed" : "pointer",
                    }}
                  >
                    Watchlist
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--dn-muted, #8b95a6)" }}>
            No picks match that filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

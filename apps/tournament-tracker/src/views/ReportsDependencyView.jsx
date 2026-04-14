import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";

// ─── Color scale ───────────────────────────────────────────────────────────────
// Positive delta → amber/yellow, Negative delta → purple, Near zero → slate

function cellColor(delta, maxAbs) {
  if (!Number.isFinite(delta) || maxAbs === 0) {
    return { bg: "transparent", text: "#64748b" };
  }
  const t = Math.min(Math.abs(delta) / maxAbs, 1);
  if (delta > 0) {
    // slate-900 → amber-400
    const r = Math.round(15  + t * (251 - 15));
    const g = Math.round(23  + t * (191 - 23));
    const b = Math.round(42  + t * (36  - 42));
    return { bg: `rgb(${r},${g},${b})`, text: t > 0.55 ? "#1c1917" : "#fde68a" };
  } else {
    // slate-900 → purple-600
    const r = Math.round(15  + t * (147 - 15));
    const g = Math.round(23  + t * (51  - 23));
    const b = Math.round(42  + t * (234 - 42));
    return { bg: `rgb(${r},${g},${b})`, text: t > 0.55 ? "#f3e8ff" : "#c4b5fd" };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDelta(d) {
  if (!Number.isFinite(d)) return "—";
  const pct = (d * 100).toFixed(1);
  return `${d > 0 ? "+" : ""}${pct}%`;
}

// ─── Legend ────────────────────────────────────────────────────────────────────

function ColorLegend({ maxAbs }) {
  const steps = 9;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-slate-500 whitespace-nowrap">Hurts you</span>
      <div className="flex rounded overflow-hidden" style={{ height: 12 }}>
        {Array.from({ length: steps }, (_, i) => {
          const t = (i / (steps - 1)) * 2 - 1; // -1..+1
          const delta = t * maxAbs;
          const { bg } = cellColor(delta, maxAbs);
          return <div key={i} style={{ width: 20, background: bg }} />;
        })}
      </div>
      <span className="text-[10px] text-slate-500 whitespace-nowrap">Helps you</span>
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────────

export default function ReportsDependencyView() {
  const { PLAYERS, OUTCOME_DELTAS, TEAM_ABBREV } = usePoolData();
  const { pool } = usePool();

  const [sortCols, setSortCols] = useState("impact"); // "impact" | "alpha"

  // Sort players by win probability descending
  const sortedPlayers = useMemo(
    () => [...PLAYERS].sort((a, b) => (b.winProb ?? 0) - (a.winProb ?? 0)),
    [PLAYERS]
  );

  // Build ordered column list: F4 before Champ per team
  const columns = useMemo(() => {
    const teamOrder = [];
    const seen = new Set();
    for (const entry of OUTCOME_DELTAS) {
      if (!seen.has(entry.team)) { teamOrder.push(entry.team); seen.add(entry.team); }
    }

    const cols = [];
    for (const team of teamOrder) {
      const abbr = TEAM_ABBREV?.[team] || team;
      if (OUTCOME_DELTAS.find((e) => e.team === team && e.outcome === "F4"))
        cols.push({ team, outcome: "F4",    label: `${abbr} F4`,    fullLabel: `${team} Final Four` });
      if (OUTCOME_DELTAS.find((e) => e.team === team && e.outcome === "Champ"))
        cols.push({ team, outcome: "Champ", label: `${abbr} Title`, fullLabel: `${team} Championship` });
    }

    if (sortCols === "alpha") {
      cols.sort((a, b) => a.team.localeCompare(b.team) || (a.outcome === "F4" ? -1 : 1));
    } else {
      // Sort by max absolute delta across all players (most impactful first)
      const colImpact = (col) => {
        const entry = OUTCOME_DELTAS.find((e) => e.team === col.team && e.outcome === col.outcome);
        if (!entry) return 0;
        return Math.max(...Object.values(entry.deltas).map(Math.abs));
      };
      cols.sort((a, b) => colImpact(b) - colImpact(a));
    }

    return cols;
  }, [OUTCOME_DELTAS, TEAM_ABBREV, sortCols]);

  // Fast delta lookup
  const deltaMap = useMemo(() => {
    const m = new Map();
    for (const entry of OUTCOME_DELTAS) {
      m.set(`${entry.team}|${entry.outcome}`, entry.deltas ?? {});
    }
    return m;
  }, [OUTCOME_DELTAS]);

  // Max absolute delta for color normalization
  const maxAbs = useMemo(() => {
    let max = 0;
    for (const entry of OUTCOME_DELTAS) {
      for (const v of Object.values(entry.deltas)) {
        if (Math.abs(v) > max) max = Math.abs(v);
      }
    }
    return max || 1;
  }, [OUTCOME_DELTAS]);

  // Biggest upside / threat across all cells
  const { biggestUpside, biggestThreat } = useMemo(() => {
    let up = { delta: 0, player: "—", col: null };
    let dn = { delta: 0, player: "—", col: null };
    for (const col of columns) {
      const deltas = deltaMap.get(`${col.team}|${col.outcome}`) ?? {};
      for (const [player, d] of Object.entries(deltas)) {
        if (d > up.delta)   up = { delta: d, player, col };
        if (d < dn.delta)   dn = { delta: d, player, col };
      }
    }
    return { biggestUpside: up, biggestThreat: dn };
  }, [columns, deltaMap]);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!OUTCOME_DELTAS.length) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Link to="/reports" className="hover:text-slate-300 transition-colors">Reports</Link>
          <span>/</span>
          <span className="text-slate-300">Dependency Heatmap</span>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-6 py-12 text-center">
          <p className="text-slate-400 text-sm mb-1">No simulation data yet</p>
          <p className="text-slate-600 text-xs">Run the simulation to generate dependency data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/reports" className="hover:text-slate-300 transition-colors">Reports</Link>
        <span>/</span>
        <span className="text-slate-300">Dependency Heatmap</span>
      </div>

      {/* Header */}
      <div className="rounded-3xl border border-slate-800/60 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.15),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.28em] text-orange-300/80">Outcome dependencies</div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Dependency Heatmap</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          How much does each player's pool-win probability change if a given team reaches the Final Four or wins the Championship?
          Positive (amber) = benefits them. Negative (purple) = hurts them.
        </p>
        <div className="mt-3 text-xs text-slate-500">
          {pool?.name ?? "Current pool"} · {sortedPlayers.length} entries · {columns.length / 2 | 0} teams tracked
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Teams Tracked</div>
          <div className="text-3xl font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
            {columns.length / 2 | 0}
          </div>
          <div className="mt-1 text-xs text-slate-400">remaining in tournament</div>
        </div>
        <div className="rounded-2xl border border-amber-800/30 bg-amber-950/20 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-amber-600/80 mb-2">Biggest Upside</div>
          <div className="text-2xl font-bold text-amber-300 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
            {fmtDelta(biggestUpside.delta)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {biggestUpside.player} if {biggestUpside.col?.fullLabel}
          </div>
        </div>
        <div className="rounded-2xl border border-purple-800/30 bg-purple-950/20 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-purple-400/80 mb-2">Biggest Threat</div>
          <div className="text-2xl font-bold text-purple-300 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
            {fmtDelta(biggestThreat.delta)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {biggestThreat.player} if {biggestThreat.col?.fullLabel}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-slate-500">Sort columns:</span>
        {[["impact", "Most impactful"], ["alpha", "A–Z"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortCols(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              sortCols === key
                ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30"
                : "bg-slate-800/50 text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto">
          <ColorLegend maxAbs={maxAbs} />
        </div>
      </div>

      {/* Heatmap table */}
      <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="border-collapse w-full" style={{ minWidth: Math.max(500, 160 + columns.length * 72) }}>
            <thead>
              <tr>
                {/* Sticky player name header */}
                <th
                  className="sticky left-0 z-20 bg-slate-900 border-b border-r border-slate-800 px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap"
                  style={{ fontFamily: "Space Mono, monospace", minWidth: 160 }}
                >
                  Player
                </th>
                <th
                  className="sticky left-0 z-20 bg-slate-900 border-b border-r border-slate-800 px-3 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap"
                  style={{ fontFamily: "Space Mono, monospace", minWidth: 64, left: 160 }}
                >
                  Win%
                </th>

                {/* Column headers — rotated labels */}
                {columns.map((col) => (
                  <th
                    key={`${col.team}|${col.outcome}`}
                    className="border-b border-slate-800 px-1 pb-2 pt-8 text-center align-bottom"
                    style={{ minWidth: 64, width: 72 }}
                  >
                    <div
                      className="text-[10px] font-semibold text-slate-300 whitespace-nowrap"
                      style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        fontFamily: "Space Mono, monospace",
                        maxHeight: 96,
                        overflow: "hidden",
                      }}
                      title={col.fullLabel}
                    >
                      {col.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sortedPlayers.map((player, pi) => (
                <tr
                  key={player.name}
                  className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors"
                >
                  {/* Sticky name */}
                  <td
                    className="sticky left-0 z-10 bg-slate-950 border-r border-slate-800 px-4 py-2.5 whitespace-nowrap"
                    style={{ minWidth: 160 }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-600 w-4 text-right tabular-nums shrink-0" style={{ fontFamily: "Space Mono, monospace" }}>
                        {pi + 1}
                      </span>
                      <span className="text-xs font-semibold text-white truncate">{player.name}</span>
                    </div>
                  </td>

                  {/* Win% */}
                  <td
                    className="sticky z-10 bg-slate-950 border-r border-slate-800 px-3 py-2.5 text-right text-xs tabular-nums text-slate-400"
                    style={{ fontFamily: "Space Mono, monospace", left: 160 }}
                  >
                    {(player.winProb ?? 0).toFixed(1)}%
                  </td>

                  {/* Delta cells */}
                  {columns.map((col) => {
                    const deltas = deltaMap.get(`${col.team}|${col.outcome}`) ?? {};
                    const delta = deltas[player.name];
                    const { bg, text } = cellColor(delta ?? 0, maxAbs);
                    const label = delta != null ? fmtDelta(delta) : "—";
                    return (
                      <td
                        key={`${col.team}|${col.outcome}`}
                        title={`${player.name} if ${col.fullLabel}: ${label}`}
                        className="px-1 py-2 text-center border-l border-slate-800/20 transition-colors"
                        style={{ background: delta != null ? bg : "transparent" }}
                      >
                        {/* Desktop: show number; mobile: color only */}
                        <span
                          className="hidden sm:block text-[10px] font-bold tabular-nums"
                          style={{ color: delta != null ? text : "#475569", fontFamily: "Space Mono, monospace" }}
                        >
                          {label}
                        </span>
                        <span className="sm:hidden block w-full h-5" />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-slate-600 text-center">
        Delta = change in pool-win probability if outcome occurs · computed from Monte Carlo simulation · teams drop as they are eliminated
      </p>
    </div>
  );
}

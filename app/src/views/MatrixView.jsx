import { useState, useMemo } from "react";
import { usePoolData } from "../hooks/usePoolData";

const SORT_OPTIONS = [
  { key: "rank",    label: "Rank"    },
  { key: "points",  label: "Points"  },
  { key: "ppr",     label: "PPR"     },
  { key: "winProb", label: "Win %"   },
];

function getCellStyle(pick, game) {
  if (!pick || game.status === "pending") return "bg-slate-800/50 text-slate-400";
  if (game.status === "live")             return "bg-amber-900/30 text-amber-200";
  if (game.winner === pick)               return "bg-emerald-900/40 text-emerald-300";
  return "bg-red-900/30 text-red-400 line-through opacity-60";
}

function StatusBadge({ status }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" style={{ animationDuration: "1.5s" }} />
        Live
      </span>
    );
  }
  if (status === "final") {
    return <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 text-[10px] font-medium">Final</span>;
  }
  return <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px] font-medium">Soon</span>;
}

export default function MatrixView() {
  const { PLAYERS, GAMES, ROUNDS } = usePoolData();
  const [sortBy, setSortBy]             = useState("rank");
  const [selectedRound, setSelectedRound] = useState("All");
  const [hoveredGame, setHoveredGame]   = useState(null);
  const [hoveredRow, setHoveredRow]     = useState(null);

  const sortedPlayers = useMemo(() => {
    return [...PLAYERS].sort((a, b) => {
      if (sortBy === "winProb") return b.winProb - a.winProb;
      if (sortBy === "points")  return b.points  - a.points;
      if (sortBy === "ppr")     return b.ppr     - a.ppr;
      return a.rank - b.rank;
    });
  }, [sortBy]);

  const filteredGames = selectedRound === "All"
    ? GAMES
    : GAMES.filter((g) => g.round === selectedRound);

  const getPickDistribution = (gameId) => {
    const game = GAMES.find((g) => g.id === gameId);
    if (!game) return [];
    const gameIdx = GAMES.indexOf(game);
    const counts = {};
    PLAYERS.forEach((p) => {
      const pick = p.picks[gameIdx];
      if (pick) counts[pick] = (counts[pick] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  // The filter bar sits above the scroll container; the table container handles
  // both x and y scroll so sticky top-0 on <th> works without fighting overflow-x.
  return (
    // flex-col filling the viewport below the NavBar (NavBar ≈ 61px)
    <div className="flex flex-col" style={{ height: "calc(100vh - 61px)" }}>

      {/* ── Filter / sort bar (not sticky — it's always at top of this flex column) ── */}
      <div className="shrink-0 bg-slate-950 border-b border-slate-800/60 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <span className="text-[11px] text-slate-500 font-medium mr-1 whitespace-nowrap" style={{ fontFamily: "Space Mono, monospace" }}>
          {PLAYERS.length} players
        </span>
        {["All", ...ROUNDS].map((r) => (
          <button
            key={r}
            onClick={() => setSelectedRound(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedRound === r
                ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30"
                : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {r}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-slate-600 mr-1">Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sortBy === opt.key ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pick distribution tooltip */}
      {hoveredGame !== null && (
        <div className="fixed top-24 right-4 z-50 bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-2xl min-w-52 pointer-events-none">
          <p className="text-[10px] text-slate-400 mb-1 font-medium">Pick Distribution</p>
          <p className="text-sm font-bold text-white mb-3">
            {GAMES.find((g) => g.id === hoveredGame)?.matchup}
          </p>
          {getPickDistribution(hoveredGame).map(([team, count]) => (
            <div key={team} className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-300 w-24 truncate">{team}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(count / PLAYERS.length) * 100}%` }} />
                </div>
                <span className="text-[10px] text-slate-400 w-8 text-right tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                  {Math.round((count / PLAYERS.length) * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Table — flex-1 fills remaining height, overflow auto handles both axes ── */}
      {/* With a single scroll container, sticky top-0 on <th> works perfectly.     */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: 860, width: "100%" }}>
          <thead>
            <tr>
              {/* Player name — sticky top-0 AND left-0 */}
              <th
                className="sticky top-0 left-0 z-30 bg-slate-900 px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap border-r border-b border-slate-800"
                style={{ fontFamily: "Space Mono, monospace", minWidth: 160 }}
              >
                Player
              </th>

              {/* Stat columns — sticky top only */}
              {SORT_OPTIONS.slice(1).map((opt) => (
                <th
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`sticky top-0 z-20 bg-slate-900 border-b border-slate-800 px-3 py-3 text-left text-[11px] font-bold cursor-pointer uppercase tracking-wider whitespace-nowrap transition-colors ${
                    sortBy === opt.key ? "text-orange-400" : "text-slate-500 hover:text-slate-300"
                  }`}
                  style={{ fontFamily: "Space Mono, monospace" }}
                >
                  {opt.label} {sortBy === opt.key && "▼"}
                </th>
              ))}

              {/* Game columns */}
              {filteredGames.map((game) => (
                <th
                  key={game.id}
                  onMouseEnter={() => setHoveredGame(game.id)}
                  onMouseLeave={() => setHoveredGame(null)}
                  className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 px-3 py-2 text-center cursor-pointer hover:bg-slate-800 transition-colors border-l border-slate-800/30"
                  style={{ minWidth: 108 }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <StatusBadge status={game.status} />
                    <span className="text-[11px] text-slate-300 font-semibold leading-tight">{game.matchup}</span>
                    <span className="text-[10px] text-slate-600">{game.round}</span>
                    {/* Live score display */}
                    {game.status === "live" && game.score1 != null && game.score2 != null && (
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1">
                          <span
                            className="text-[11px] font-bold text-amber-400 tabular-nums"
                            style={{ fontFamily: "Space Mono, monospace" }}
                          >
                            {game.score1}–{game.score2}
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                        </div>
                        {game.gameNote && (
                          <span className="text-[9px] text-slate-500 leading-tight">{game.gameNote}</span>
                        )}
                        <span className="text-[9px] text-slate-600">ESPN</span>
                      </div>
                    )}
                    {game.status === "final" && game.score1 != null && game.score2 != null && (
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className="text-[11px] text-slate-500 tabular-nums"
                          style={{ fontFamily: "Space Mono, monospace" }}
                        >
                          {game.score1}–{game.score2}
                        </span>
                        <span className="text-[9px] text-slate-600">ESPN</span>
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedPlayers.map((player, pi) => (
              <tr
                key={player.name}
                onMouseEnter={() => setHoveredRow(pi)}
                onMouseLeave={() => setHoveredRow(null)}
                className={`border-b border-slate-800/40 transition-colors ${
                  hoveredRow === pi ? "bg-slate-800/40" : "hover:bg-slate-800/20"
                }`}
              >
                <td
                  className={`sticky left-0 z-10 px-4 py-2.5 border-r border-slate-800 transition-colors ${
                    hoveredRow === pi ? "bg-slate-800/60" : "bg-slate-950"
                  }`}
                  style={{ minWidth: 160 }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 w-4 text-right tabular-nums shrink-0" style={{ fontFamily: "Space Mono, monospace" }}>
                      {player.rank}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">{player.name}</span>
                    {player.champAlive && <span className="text-emerald-500 text-[10px] shrink-0">♛</span>}
                  </div>
                </td>

                <td className="px-3 py-2.5 text-xs font-bold tabular-nums text-white" style={{ fontFamily: "Space Mono, monospace" }}>
                  {player.points.toLocaleString()}
                </td>

                <td className="px-3 py-2.5 text-xs text-slate-400 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                  {player.ppr}
                </td>

                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold tabular-nums"
                      style={{
                        fontFamily: "Space Mono, monospace",
                        color: player.winProb > 10 ? "#34d399" : player.winProb > 5 ? "#fbbf24" : "#94a3b8",
                      }}
                    >
                      {player.winProb}%
                    </span>
                    <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(player.winProb * 4, 100)}%`,
                          background: player.winProb > 10 ? "#34d399" : player.winProb > 5 ? "#fbbf24" : "#64748b",
                        }}
                      />
                    </div>
                  </div>
                </td>

                {filteredGames.map((game) => {
                  const gameIdx = GAMES.indexOf(game);
                  const pick = player.picks[gameIdx];
                  return (
                    <td
                      key={game.id}
                      className={`px-2 py-2.5 text-center text-[11px] font-semibold border-l border-slate-800/30 ${getCellStyle(pick, game)}`}
                    >
                      {pick || "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

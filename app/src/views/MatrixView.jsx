import { useState, useMemo, useEffect } from "react";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { seededTeamLabel } from "../lib/teamNames";

const teamLabel = (game, which) => {
  const abbrev = which === 1 ? game.abbrev1 : game.abbrev2;
  const full   = which === 1 ? game.team1   : game.team2;
  const seed   = which === 1 ? game.seed1   : game.seed2;
  return seededTeamLabel(full, seed, abbrev);
};

const SORT_OPTIONS = [
  { key: "rank",    label: "Rank"    },
  { key: "points",  label: "Points"  },
  { key: "ppr",     label: "PPR"     },
  { key: "winProb", label: "Win %"   },
];

const COL_WIDTHS = { R64: 76, R32: 88, S16: 96, E8: 106, F4: 112, Champ: 120 }

function getCellStyle(pick, game) {
  if (!pick || game.status === "pending") return "bg-slate-800/50 text-slate-400";
  if (game.status === "live")             return "bg-amber-900/30 text-amber-200";
  if (game.winner === pick)               return "bg-emerald-900/40 text-emerald-300";
  return "bg-red-900/30 text-red-400 line-through opacity-60";
}

// seedLabel removed — seeds now inline in team labels

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
  return null;
}

export default function MatrixView() {
  const { PLAYERS, GAMES, ROUNDS, LEVERAGE_GAMES, PLAYER_LEVERAGE } = usePoolData();
  const { pool } = usePool();
  const { profile } = useAuth();
  const [sortBy, setSortBy]             = useState("rank");
  const [selectedRound, setSelectedRound] = useState("All");
  const [hoveredGame, setHoveredGame]   = useState(null);
  const [hoveredRow, setHoveredRow]     = useState(null);

  // When pool is not locked, each user sees only their own picks
  const isLocked = pool?.locked === true;

  // Live filter: auto-switch when games go live / all end
  const hasLiveGames = useMemo(() => GAMES.some(g => g.status === 'live'), [GAMES]);

  useEffect(() => {
    if (hasLiveGames && selectedRound === 'All') setSelectedRound('Live');
    if (!hasLiveGames && selectedRound === 'Live') setSelectedRound('All');
  }, [hasLiveGames]);

  const sortedPlayers = useMemo(() => {
    return [...PLAYERS].sort((a, b) => {
      if (sortBy === "winProb") return b.winProb - a.winProb;
      if (sortBy === "points")  return b.points  - a.points;
      if (sortBy === "ppr")     return b.ppr     - a.ppr;
      return a.rank - b.rank;
    });
  }, [sortBy]);

  // Build leverage lookup by slot_index for cell deltas
  const leverageBySlot = useMemo(() => {
    const map = {};
    for (const lg of (LEVERAGE_GAMES || [])) map[lg.id] = lg;
    return map;
  }, [LEVERAGE_GAMES]);

  const filteredGames = selectedRound === "All"
    ? GAMES
    : selectedRound === "Live"
      ? GAMES.filter((g) => g.status === "live")
      : GAMES.filter((g) => g.round === selectedRound);

  const getPickDistribution = (gameId) => {
    const game = GAMES.find((g) => g.id === gameId);
    if (!game) return [];
    const counts = {};
    PLAYERS.forEach((p) => {
      const pick = p.picks[game.slot_index];
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
        {[...(hasLiveGames ? ['Live'] : []), 'All', ...ROUNDS].map((r) => (
          <button
            key={r}
            onClick={() => setSelectedRound(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              r === 'Live'
                ? selectedRound === r
                  ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
                  : "bg-red-950/40 text-red-400 hover:bg-red-500/20"
                : selectedRound === r
                  ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30"
                  : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {r === 'Live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
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

      {/* Pre-lock privacy banner */}
      {!isLocked && (
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 bg-amber-950/30 border-b border-amber-800/20">
          <span className="text-amber-500 text-[11px]">&#x1F512;</span>
          <span className="text-[11px] text-amber-400/80" style={{ fontFamily: "Space Mono, monospace" }}>
            Picks are hidden until the pool locks at tip-off
          </span>
        </div>
      )}

      {/* Pick distribution tooltip — only after pool locks */}
      {hoveredGame !== null && isLocked && (
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
              {filteredGames.map((game) => {
                const isLive = game.status === "live";
                const colW   = COL_WIDTHS[game.roundKey] ?? 96;
                // header bg: live > key game > default
                const headerBg = isLive
                  ? "bg-red-950/50"
                  : game.isKeyGame
                    ? "bg-orange-950/30"
                    : "bg-slate-900";
                return (
                  <th
                    key={game.id}
                    onMouseEnter={() => isLocked && setHoveredGame(game.id)}
                    onMouseLeave={() => setHoveredGame(null)}
                    className={`sticky top-0 z-20 border-b border-slate-800 px-2 py-1.5 text-center transition-colors ${headerBg} ${isLocked ? "cursor-pointer hover:brightness-125" : ""}`}
                    style={{
                      minWidth: colW,
                      borderLeft: game.firstInRegion
                        ? `2px solid ${game.regionColor}`
                        : "1px solid rgb(30 41 59 / 0.5)",
                      borderTop: `2px solid ${game.regionColor}55`,
                    }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {/* Matchup — abbreviations with inline seeds */}
                      {game.status === "final" ? (
                        <span className="text-[11px] leading-tight text-slate-500">
                          <span className="font-bold text-slate-300">{game.winner === game.team1 ? teamLabel(game, 1) : teamLabel(game, 2)}</span>
                          {' vs '}
                          <span className="line-through opacity-60">{game.winner === game.team1 ? teamLabel(game, 2) : teamLabel(game, 1)}</span>
                        </span>
                      ) : (
                        <span className={`text-[11px] font-semibold leading-tight ${isLive ? "text-white" : "text-slate-300"}`}>
                          {teamLabel(game, 1)} vs {teamLabel(game, 2)}
                        </span>
                      )}

                      {/* Pending: game time */}
                      {game.status === "pending" && game.gameTime && (
                        <span className="text-[9px] text-slate-400 leading-none tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                          {game.gameTime}
                        </span>
                      )}

                      {/* Live: score with pulsing dot + game note */}
                      {isLive && game.score1 != null && game.score2 != null && (
                        <div className="flex items-center gap-1">
                          <span
                            className="text-[11px] font-bold text-amber-400 tabular-nums"
                            style={{ fontFamily: "Space Mono, monospace" }}
                          >
                            {game.score1}–{game.score2}
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                        </div>
                      )}
                      {isLive && game.gameNote && (
                        <span className="text-[9px] text-slate-500 leading-none">{game.gameNote}</span>
                      )}

                      {/* Final: score (muted) */}
                      {game.status === "final" && game.score1 != null && game.score2 != null && (
                        <span
                          className="text-[10px] text-slate-500 tabular-nums"
                          style={{ fontFamily: "Space Mono, monospace" }}
                        >
                          {game.score1}–{game.score2}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
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
                  // Use slot_index for correct picks lookup across all 63 slots
                  const isOwnRow = player.name === profile?.username;
                  const pick = (!isLocked && !isOwnRow) ? null : player.picks[game.slot_index];
                  const hidden = !isLocked && !isOwnRow;

                  // Compute delta for live games: what happens to this player's win% if their pick wins
                  let cellDelta = null;
                  if (game.status === 'live' && pick && !hidden) {
                    const lg = leverageBySlot[game.slot_index];
                    const imp = lg?.playerImpacts?.find(p => p.player === player.name);
                    if (imp) {
                      const pickIsTeam1 = pick === game.team1;
                      const ifPickWins = pickIsTeam1 ? imp.ifTeam1 : imp.ifTeam2;
                      cellDelta = ifPickWins - (player.winProb ?? 0);
                    }
                  }

                  return (
                    <td
                      key={game.id}
                      className={`px-2 py-1.5 text-center text-[11px] font-semibold border-l border-slate-800/30 ${
                        hidden ? "bg-slate-900/40 text-slate-700" : getCellStyle(pick, game)
                      }`}
                    >
                      {hidden ? "—" : (
                        <div className="flex flex-col items-center">
                          <span>{pick || "—"}</span>
                          {cellDelta != null && (
                            <span
                              className={`text-[9px] font-bold tabular-nums leading-tight ${
                                cellDelta > 0 ? 'text-emerald-400' : cellDelta < 0 ? 'text-red-400' : 'text-slate-500'
                              }`}
                              style={{ fontFamily: "Space Mono, monospace" }}
                            >
                              {cellDelta > 0 ? '+' : ''}{cellDelta.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )}
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

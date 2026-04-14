import { useState, useMemo } from "react";

const ROUNDS = ["Elite 8", "Final Four", "Championship"];
const GAMES = [
  { id: 1, round: "Elite 8", matchup: "Kent vs ND", team1: "Kentucky", team2: "Notre Dame", status: "final", winner: "Kentucky" },
  { id: 2, round: "Elite 8", matchup: "Wisc vs Ariz", team1: "Wisconsin", team2: "Arizona", status: "final", winner: "Wisconsin" },
  { id: 3, round: "Elite 8", matchup: "Mich St vs Lou", team1: "Michigan St", team2: "Louisville", status: "final", winner: "Michigan St" },
  { id: 4, round: "Elite 8", matchup: "Duke vs Gonz", team1: "Duke", team2: "Gonzaga", status: "final", winner: "Duke" },
  { id: 5, round: "Final Four", matchup: "Kent vs Wisc", team1: "Kentucky", team2: "Wisconsin", status: "final", winner: "Wisconsin" },
  { id: 6, round: "Final Four", matchup: "Duke vs MSU", team1: "Duke", team2: "Michigan St", status: "live", winner: null },
  { id: 7, round: "Championship", matchup: "TBD vs TBD", team1: null, team2: null, status: "pending", winner: null },
];

const PLAYERS = [
  { rank: 1, name: "erika-lenhart", points: 1370, ppr: 480, winProb: 23.4, picks: ["Kentucky","Wisconsin","Virginia","Duke","Kentucky","Duke","Duke"] },
  { rank: 2, name: "PayThePlayers", points: 1330, ppr: 480, winProb: 19.1, picks: ["Kentucky","Wisconsin","Virginia","Duke","Kentucky","Duke","Duke"] },
  { rank: 3, name: "ewolfe9", points: 1150, ppr: 640, winProb: 15.7, picks: ["Kentucky","UNC","Villanova","Duke","Kentucky","Duke","Duke"] },
  { rank: 4, name: "Stefan G.", points: 1130, ppr: 480, winProb: 8.2, picks: ["Kentucky","Wisconsin","Oklahoma","Duke","Wisconsin","Duke","Wisconsin"] },
  { rank: 5, name: "Roberto8464", points: 1080, ppr: 320, winProb: 6.8, picks: ["Kentucky","Wisconsin","Louisville","Duke","Kentucky","Duke","Kentucky"] },
  { rank: 5, name: "DancingInDark", points: 1080, ppr: 480, winProb: 6.1, picks: ["Kentucky","Wisconsin","Louisville","Duke","Wisconsin","Duke","Kentucky"] },
  { rank: 7, name: "Eric4197", points: 1030, ppr: 480, winProb: 5.3, picks: ["Kentucky","Wisconsin","Villanova","Duke","Wisconsin","Villanova","Villanova"] },
  { rank: 8, name: "dukesucks15", points: 1020, ppr: 480, winProb: 4.9, picks: ["Kentucky","Wisconsin","Virginia","Duke","Kentucky","Duke","Kentucky"] },
  { rank: 9, name: "josedavila", points: 1010, ppr: 480, winProb: 3.2, picks: ["Kentucky","Wisconsin","Virginia","Duke","Kentucky","Duke","Kentucky"] },
  { rank: 10, name: "MediocreBrckt", points: 1000, ppr: 320, winProb: 2.8, picks: ["Kentucky","Arizona","Villanova","Duke","Kentucky","Duke","Kentucky"] },
  { rank: 10, name: "KicyMotley", points: 1000, ppr: 320, winProb: 2.1, picks: ["Kentucky","Arizona","Virginia","Duke","Kentucky","Duke","Kentucky"] },
  { rank: 10, name: "on Paul Lupo", points: 1000, ppr: 480, winProb: 1.9, picks: ["Kentucky","UNC","Michigan St","Duke","Kentucky","Duke","Kentucky"] },
  { rank: 13, name: "Bing", points: 970, ppr: 320, winProb: 0.5, picks: ["Kentucky","UNC","Louisville","Duke","Kentucky","Duke","Kentucky"] },
  { rank: 14, name: "jackiedee", points: 960, ppr: 480, winProb: 0.3, picks: ["Kentucky","Wisconsin","Villanova","Iowa St","Wisconsin","Villanova","Wisconsin"] },
  { rank: 14, name: "Josh Gold", points: 960, ppr: 320, winProb: 0.1, picks: ["Kentucky","Wisconsin","Virginia","Duke","Kentucky","Duke","Kentucky"] },
];

const SORT_OPTIONS = [
  { key: "rank", label: "Rank" },
  { key: "points", label: "Points" },
  { key: "ppr", label: "PPR" },
  { key: "winProb", label: "Win %" },
];

function getCellColor(pick, game) {
  if (game.status === "pending") return "bg-slate-800/50 text-slate-300";
  if (game.status === "live") return "bg-amber-900/30 text-amber-200 animate-pulse";
  if (game.winner === pick) return "bg-emerald-900/40 text-emerald-300";
  return "bg-red-900/30 text-red-400 line-through opacity-60";
}

function getStatusBadge(status) {
  if (status === "live") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-bold tracking-wider uppercase"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" style={{animationDuration:"1.5s"}}></span>Live</span>;
  if (status === "final") return <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 text-xs font-medium">Final</span>;
  return <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-xs font-medium">Upcoming</span>;
}

export default function MatrixView() {
  const [sortBy, setSortBy] = useState("rank");
  const [selectedRound, setSelectedRound] = useState("All");
  const [hoveredGame, setHoveredGame] = useState(null);
  const [hoveredPlayer, setHoveredPlayer] = useState(null);

  const sortedPlayers = useMemo(() => {
    return [...PLAYERS].sort((a, b) => {
      if (sortBy === "winProb") return b.winProb - a.winProb;
      if (sortBy === "points") return b.points - a.points;
      if (sortBy === "ppr") return b.ppr - a.ppr;
      return a.rank - b.rank;
    });
  }, [sortBy]);

  const filteredGames = selectedRound === "All" ? GAMES : GAMES.filter(g => g.round === selectedRound);

  const getPickDistribution = (gameIndex) => {
    const picks = {};
    PLAYERS.forEach(p => {
      const pick = p.picks[gameIndex];
      picks[pick] = (picks[pick] || 0) + 1;
    });
    return Object.entries(picks).sort((a, b) => b[1] - a[1]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white" style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-sm font-bold" style={{ fontFamily: "Space Mono" }}>M</div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">NYC Madness 2025</h1>
                <p className="text-xs text-slate-500">Pick Matrix — {PLAYERS.length} players</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {["All", ...ROUNDS].map(r => (
                <button key={r} onClick={() => setSelectedRound(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedRound === r ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30" : "bg-slate-800/50 text-slate-400 hover:bg-slate-800"}`}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hover tooltip for pick distribution */}
      {hoveredGame !== null && (
        <div className="fixed top-20 right-4 z-40 bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-2xl min-w-48">
          <p className="text-xs text-slate-400 mb-1 font-medium">Pick Distribution</p>
          <p className="text-sm font-bold text-white mb-3">{GAMES[hoveredGame]?.matchup}</p>
          {getPickDistribution(hoveredGame).map(([team, count]) => (
            <div key={team} className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-slate-300">{team}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(count / PLAYERS.length) * 100}%` }}></div>
                </div>
                <span className="text-xs text-slate-400 w-8 text-right" style={{ fontFamily: "Space Mono" }}>{Math.round((count / PLAYERS.length) * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 800 }}>
          <thead>
            <tr className="bg-slate-900/80 sticky top-14 z-20">
              {SORT_OPTIONS.map(opt => (
                <th key={opt.key} onClick={() => setSortBy(opt.key)} className={`px-3 py-2.5 text-left text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${sortBy === opt.key ? "text-orange-400" : "text-slate-500 hover:text-slate-300"}`} style={{ fontFamily: "Space Mono" }}>
                  {opt.label} {sortBy === opt.key && "▼"}
                </th>
              ))}
              {filteredGames.map((game, i) => (
                <th key={game.id} onMouseEnter={() => setHoveredGame(GAMES.indexOf(game))} onMouseLeave={() => setHoveredGame(null)} className="px-2 py-2.5 text-center cursor-pointer hover:bg-slate-800/50 transition-colors" style={{ minWidth: 100 }}>
                  <div className="flex flex-col items-center gap-1">
                    {getStatusBadge(game.status)}
                    <span className="text-xs text-slate-400 font-medium">{game.matchup}</span>
                    <span className="text-[10px] text-slate-600">{game.round}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player, pi) => (
              <tr key={player.name} onMouseEnter={() => setHoveredPlayer(pi)} onMouseLeave={() => setHoveredPlayer(null)} className={`border-b border-slate-800/40 transition-colors ${hoveredPlayer === pi ? "bg-slate-800/30" : "hover:bg-slate-800/20"}`}>
                <td className="px-3 py-2 text-xs text-slate-500 tabular-nums" style={{ fontFamily: "Space Mono" }}>{player.rank}</td>
                <td className="px-3 py-2 text-xs font-bold tabular-nums" style={{ fontFamily: "Space Mono" }}>{player.points.toLocaleString()}</td>
                <td className="px-3 py-2 text-xs text-slate-400 tabular-nums" style={{ fontFamily: "Space Mono" }}>{player.ppr}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tabular-nums" style={{ fontFamily: "Space Mono", color: player.winProb > 10 ? "#34d399" : player.winProb > 5 ? "#fbbf24" : "#94a3b8" }}>{player.winProb}%</span>
                    <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(player.winProb * 4, 100)}%`, background: player.winProb > 10 ? "#34d399" : player.winProb > 5 ? "#fbbf24" : "#64748b" }}></div>
                    </div>
                  </div>
                </td>
                {filteredGames.map((game) => {
                  const gameIdx = GAMES.indexOf(game);
                  const pick = player.picks[gameIdx];
                  return (
                    <td key={game.id} className={`px-2 py-2 text-center text-xs font-medium ${getCellColor(pick, game)}`}>{pick || "—"}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Player name overlay on left */}
      <div className="fixed left-0 top-14 bottom-0 w-36 bg-gradient-to-r from-slate-950 via-slate-950 to-transparent pointer-events-none z-10 hidden">
        {/* This would be the sticky name column in production */}
      </div>
    </div>
  );
}

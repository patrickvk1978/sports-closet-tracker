import { useMemo } from "react";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";

function winProbTone(winProb) {
  if (winProb >= 20) return "text-emerald-300";
  if (winProb >= 8) return "text-amber-300";
  return "text-slate-300";
}

export default function ReportsStandingsView() {
  const { PLAYERS } = usePoolData();
  const { pool } = usePool();

  const sortedPlayers = useMemo(
    () => [...PLAYERS].sort((a, b) => (a.rank - b.rank) || ((b.winProb ?? 0) - (a.winProb ?? 0))),
    [PLAYERS]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80">Reports / Standings Snapshot</div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">Standings Snapshot</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          A cleaner report-style leaderboard for {pool?.name ?? "this pool"}, focused on current position and championship equity.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/60">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3">Points</th>
                <th className="px-4 py-3">PPR</th>
                <th className="px-4 py-3">Win %</th>
                <th className="px-4 py-3">Title Path</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player) => (
                <tr key={player.name} className="border-b border-slate-800/60 last:border-b-0">
                  <td className="px-4 py-3 text-sm font-semibold text-white">#{player.rank}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-white">{player.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {player.trend === "up" ? "Trending up" : player.trend === "down" ? "Trending down" : "Holding steady"}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 text-sm font-bold text-white tabular-nums"
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {player.points}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-300 tabular-nums"
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {player.ppr}
                  </td>
                  <td
                    className={`px-4 py-3 text-sm font-bold tabular-nums ${winProbTone(player.winProb ?? 0)}`}
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {(player.winProb ?? 0).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        player.champAlive
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : "border-red-500/20 bg-red-500/10 text-red-300"
                      }`}
                    >
                      {player.champAlive ? "Champion alive" : "Champion out"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

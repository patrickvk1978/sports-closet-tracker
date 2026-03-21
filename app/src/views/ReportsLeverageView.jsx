import { useMemo } from "react";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";

function formatDelta(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe > 0 ? "+" : ""}${safe.toFixed(1)}%`;
}

export default function ReportsLeverageView() {
  const { LEVERAGE_GAMES, GAMES, PLAYER_LEVERAGE, PLAYERS } = usePoolData();
  const { pool } = usePool();

  const playerLeverageRows = useMemo(
    () =>
      Object.entries(PLAYER_LEVERAGE ?? {})
        .slice(0, 8)
        .map(([name, impacts]) => {
          const topImpact = (impacts ?? []).reduce((best, impact) => {
            const delta1 = Math.abs((impact.ifTeam1 ?? 0) - (impact.base ?? 0));
            const delta2 = Math.abs((impact.ifTeam2 ?? 0) - (impact.base ?? 0));
            const swing = Math.max(delta1, delta2);
            return swing > best.swing ? { swing, impact } : best;
          }, { swing: 0, impact: null });
          return { name, swing: topImpact.swing, impact: topImpact.impact };
        })
        .sort((a, b) => b.swing - a.swing),
    [PLAYER_LEVERAGE]
  );

  const liveCount = GAMES.filter((game) => game.status === "live").length;
  const totalEntries = PLAYERS.length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80">Reports / Leverage</div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">Leverage Report</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          The race pivots that matter most in {pool?.name ?? "this pool"} right now, from shared swing games to personal pressure points.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Tracked swing games</div>
          <div className="mt-3 text-3xl font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>
            {LEVERAGE_GAMES?.length ?? 0}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Live right now</div>
          <div className="mt-3 text-3xl font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>
            {liveCount}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Entries modeled</div>
          <div className="mt-3 text-3xl font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>
            {totalEntries}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/60">
          <div className="border-b border-slate-800/70 px-5 py-4">
            <div className="text-sm font-bold text-white">Pool Swing Board</div>
            <div className="mt-1 text-xs text-slate-500">The biggest shared pressure points across the pool.</div>
          </div>
          <div className="divide-y divide-slate-800/60">
            {(LEVERAGE_GAMES ?? []).map((game, index) => (
              <div key={`${game.game ?? "game"}-${index}`} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{game.game ?? game.matchup ?? "Swing game"}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {(game.team1 ?? "Team 1")} vs {(game.team2 ?? "Team 2")}
                    </div>
                  </div>
                  {game.avgSwing != null && (
                    <div
                      className="text-sm font-bold text-orange-300 tabular-nums"
                      style={{ fontFamily: "Space Mono, monospace" }}
                    >
                      {formatDelta(game.avgSwing)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/60">
          <div className="border-b border-slate-800/70 px-5 py-4">
            <div className="text-sm font-bold text-white">Personal Pressure Points</div>
            <div className="mt-1 text-xs text-slate-500">Which entries are most exposed to a single result.</div>
          </div>
          <div className="divide-y divide-slate-800/60">
            {playerLeverageRows.length === 0 && (
              <div className="px-5 py-6 text-sm text-slate-400">Player-level leverage data will appear here once simulation output is available.</div>
            )}
            {playerLeverageRows.map((row) => (
              <div key={row.name} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white">{row.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.impact?.game ?? row.impact?.matchup ?? "Top swing spot not labeled yet"}
                    </div>
                  </div>
                  <div
                    className="text-sm font-bold text-amber-300 tabular-nums"
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {formatDelta(row.swing)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

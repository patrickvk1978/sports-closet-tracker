import { useState, useMemo } from "react";
import {
  PLAYERS,
  PLAYER_COLORS,
  LEVERAGE_GAMES,
  CONSENSUS,
  ELIMINATION_STATS,
  WIN_PROB_HISTORY,
} from "../data/mockData";

const MAX_PROB = 35;

function MiniChart({ data, playerKey, color }) {
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (d.players[playerKey] / MAX_PROB) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LivePing() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
    </span>
  );
}

function TrendArrow({ trend }) {
  if (trend === "up")   return <span className="text-emerald-400 text-sm font-bold">↑</span>;
  if (trend === "down") return <span className="text-red-400 text-sm font-bold">↓</span>;
  return <span className="text-slate-500 text-sm font-bold">→</span>;
}

export default function Dashboard() {
  const [selectedName, setSelectedName] = useState(PLAYERS[0].name);

  const player = useMemo(() => PLAYERS.find((p) => p.name === selectedName), [selectedName]);

  const closestRival = useMemo(() => {
    return PLAYERS.filter((p) => p.name !== player.name).reduce((best, rival) => {
      const matches = player.picks.reduce(
        (acc, pick, i) => (pick === rival.picks[i] ? acc + 1 : acc),
        0
      );
      const divergences = player.picks.length - matches;
      return !best || matches > best.matches ? { ...rival, matches, divergences } : best;
    }, null);
  }, [player]);

  const leaderboard = useMemo(() => [...PLAYERS].sort((a, b) => a.rank - b.rank), []);

  const liveGame    = LEVERAGE_GAMES.find((g) => g.status === "live");
  const upcomingGames = LEVERAGE_GAMES.filter((g) => g.status !== "live");
  const playerLiveAlert = liveGame?.alerts.find((a) => a.player === player.name);

  const contrarian = useMemo(() => {
    return PLAYERS[0].picks.map((_, i) => {
      const counts = {};
      PLAYERS.forEach((p) => { if (p.picks[i]) counts[p.picks[i]] = (counts[p.picks[i]] || 0) + 1; });
      const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      return player.picks[i] && player.picks[i] !== majority;
    }).filter(Boolean).length;
  }, [player]);

  const championPick = player.picks[6] ?? "—";
  const maxPossible  = player.points + player.ppr;

  const winProbColor =
    player.winProb > 15 ? "#34d399" : player.winProb > 8 ? "#fbbf24" : "#94a3b8";
  const hasSparkline = WIN_PROB_HISTORY[0].players[selectedName] !== undefined;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

      {/* ── 1. Hero — Personal Standing ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/40 border border-slate-700/50 p-6">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-orange-500/5 pointer-events-none" />

        {/* Top row: player selector + rank badge */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <select
              value={selectedName}
              onChange={(e) => setSelectedName(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-white cursor-pointer max-w-xs w-full"
            >
              {PLAYERS.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            {/* Champion pick + status */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[11px] text-slate-500">Champion pick:</span>
              <span className="text-[11px] font-bold text-white">{championPick}</span>
              {player.champAlive ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 font-semibold border border-emerald-800/40">♛ Alive</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 font-semibold border border-red-800/30">Eliminated</span>
              )}
            </div>
          </div>

          {/* Rank badge + trend */}
          <div className="flex items-center gap-2 shrink-0">
            <TrendArrow trend={player.trend} />
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-center">
              <span
                className="text-xl font-bold text-white tabular-nums leading-none"
                style={{ fontFamily: "Space Mono, monospace" }}
              >
                {player.rank}
              </span>
              <span className="text-xs text-slate-500"> of {PLAYERS.length}</span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Points",        value: player.points.toLocaleString(), color: "text-white"    },
            { label: "Pts Remaining", value: player.ppr.toLocaleString(),    color: "text-slate-300"},
            { label: "Win Prob",      value: `${player.winProb}%`,           color: winProbColor,   style: true },
            { label: "Max Possible",  value: maxPossible.toLocaleString(),   color: "text-slate-400"},
          ].map(({ label, value, color, style }) => (
            <div key={label} className="bg-slate-800/50 rounded-xl px-4 py-3">
              <div
                className={`text-2xl font-bold tabular-nums leading-none ${!style ? color : ""}`}
                style={{ fontFamily: "Space Mono, monospace", ...(style ? { color } : {}) }}
              >
                {value}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>

        {/* Bottom row: contrarian note + live swing + sparkline */}
        <div className="flex items-center gap-4 flex-wrap">
          {contrarian > 0 && (
            <span className="text-[11px] text-slate-500">
              <span className="text-orange-400 font-semibold">{contrarian} pick{contrarian !== 1 ? "s" : ""}</span> where most of the pool disagrees
            </span>
          )}
          {playerLiveAlert && (
            <div className="flex items-center gap-2 ml-auto">
              <LivePing />
              <span className="text-[11px] text-slate-400">
                If <span className="font-semibold text-white">{liveGame.team1}</span> wins:
                <span className="text-emerald-400 font-bold tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}> {playerLiveAlert.ifTeam1}%</span>
                <span className="text-slate-600 mx-1">·</span>
                If <span className="font-semibold text-white">{liveGame.team2}</span> wins:
                <span className="text-red-400 font-bold tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}> {playerLiveAlert.ifTeam2}%</span>
              </span>
            </div>
          )}
          {hasSparkline && !playerLiveAlert && (
            <div className="w-24 h-8 opacity-50 ml-auto">
              <MiniChart data={WIN_PROB_HISTORY} playerKey={selectedName} color={PLAYER_COLORS[selectedName] ?? "#f97316"} />
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Critical Intelligence — Live Game + Closest Rival ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Live game card */}
        {liveGame && (
          <div className="bg-slate-900/60 border border-red-800/30 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-red-800/20 bg-red-950/20 flex items-center gap-2">
              <LivePing />
              <span className="text-xs font-bold text-red-300">{liveGame.matchup}</span>
              <span className="text-[10px] text-slate-500 ml-auto">{liveGame.time}</span>
            </div>
            <div className="p-5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-3">
                Your bracket impact
              </p>
              {playerLiveAlert ? (
                <>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between bg-emerald-900/20 border border-emerald-800/20 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-slate-300">If <span className="font-bold text-white">{liveGame.team1}</span> wins</span>
                      <span
                        className="text-sm font-bold tabular-nums text-emerald-400"
                        style={{ fontFamily: "Space Mono, monospace" }}
                      >
                        → {playerLiveAlert.ifTeam1}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-red-900/20 border border-red-800/20 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-slate-300">If <span className="font-bold text-white">{liveGame.team2}</span> wins</span>
                      <span
                        className="text-sm font-bold tabular-nums text-red-400"
                        style={{ fontFamily: "Space Mono, monospace" }}
                      >
                        → {playerLiveAlert.ifTeam2}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs text-amber-300 font-medium">Win probability swing</span>
                    <span
                      className="text-base font-bold text-amber-400 tabular-nums"
                      style={{ fontFamily: "Space Mono, monospace" }}
                    >
                      ±{playerLiveAlert.swing}%
                    </span>
                  </div>
                </>
              ) : (
                <div className="bg-slate-800/40 rounded-xl px-4 py-3">
                  <p className="text-sm text-slate-500">
                    This game doesn't directly affect your win probability.
                  </p>
                </div>
              )}
              <p className="text-[10px] text-slate-600 mt-3">
                Affects {liveGame.alerts.length} of {PLAYERS.length} players in the pool
              </p>
            </div>
          </div>
        )}

        {/* Closest rival card */}
        {closestRival && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800/60">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Closest Rival
              </p>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <button
                    onClick={() => setSelectedName(closestRival.name)}
                    className="text-base font-bold text-white hover:text-orange-400 transition-colors text-left"
                  >
                    {closestRival.name}
                  </button>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rank #{closestRival.rank} · {closestRival.points.toLocaleString()} pts
                  </p>
                </div>
                <div className="text-right">
                  <div
                    className="text-2xl font-bold tabular-nums"
                    style={{
                      fontFamily: "Space Mono, monospace",
                      color:
                        closestRival.winProb > 15
                          ? "#34d399"
                          : closestRival.winProb > 8
                          ? "#fbbf24"
                          : "#94a3b8",
                    }}
                  >
                    {closestRival.winProb}%
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">win probability</div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-3 mb-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-400">Bracket similarity</span>
                  <span
                    className="font-bold text-white tabular-nums"
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {closestRival.matches}/{player.picks.length} picks match
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full"
                    style={{ width: `${(closestRival.matches / player.picks.length) * 100}%` }}
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-500">
                {closestRival.divergences} pick{closestRival.divergences !== 1 ? "s" : ""} differ —
                those games separate you
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Upcoming High-Leverage Games ─────────────────────────────────── */}
      {upcomingGames.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/60">
            <h2
              className="text-[11px] font-bold text-slate-300 tracking-widest uppercase"
              style={{ fontFamily: "Space Mono, monospace" }}
            >
              Upcoming High-Leverage Games
            </h2>
          </div>
          <div className="divide-y divide-slate-800/40">
            {upcomingGames.map((game, gi) => {
              const playerUpAlert = game.alerts.find((a) => a.player === player.name);
              return (
                <div key={gi} className="p-5">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-medium whitespace-nowrap">
                      {game.time}
                    </span>
                    <span className="text-sm font-bold text-white">{game.matchup}</span>
                    {playerUpAlert && (
                      <span
                        className="ml-auto text-xs font-bold text-amber-400 tabular-nums"
                        style={{ fontFamily: "Space Mono, monospace" }}
                      >
                        Your swing: ±{playerUpAlert.swing}%
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {game.alerts.map((alert, ai) => (
                      <div
                        key={ai}
                        className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${
                          alert.player === player.name
                            ? "bg-orange-500/10 border border-orange-500/20"
                            : "bg-slate-800/30"
                        }`}
                      >
                        <span className="text-xs font-medium text-slate-300 w-28 truncate">
                          {alert.player}
                        </span>
                        <div className="flex-1 flex items-center gap-2">
                          <span
                            className="text-[10px] text-emerald-400 tabular-nums w-10 text-right"
                            style={{ fontFamily: "Space Mono, monospace" }}
                          >
                            {alert.ifTeam1}%
                          </span>
                          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden relative">
                            <div
                              className="absolute left-0 h-full bg-emerald-500/60 rounded-full"
                              style={{ width: `${Math.min(alert.ifTeam1 * 3, 100)}%` }}
                            />
                            <div
                              className="absolute right-0 h-full bg-red-500/60 rounded-full"
                              style={{ width: `${Math.min(alert.ifTeam2 * 3, 100)}%` }}
                            />
                          </div>
                          <span
                            className="text-[10px] text-red-400 tabular-nums w-10"
                            style={{ fontFamily: "Space Mono, monospace" }}
                          >
                            {alert.ifTeam2}%
                          </span>
                        </div>
                        <div className="bg-amber-500/10 px-2 py-0.5 rounded-lg">
                          <span
                            className="text-[10px] font-bold text-amber-400 tabular-nums"
                            style={{ fontFamily: "Space Mono, monospace" }}
                          >
                            ±{alert.swing}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. Tournament Pulse ─────────────────────────────────────────────── */}
      <div>
        <p
          className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-3 px-1"
          style={{ fontFamily: "Space Mono, monospace" }}
        >
          Tournament Pulse
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {ELIMINATION_STATS.map((stat) => (
            <div
              key={stat.label}
              className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg">{stat.icon}</span>
                <span
                  className="text-2xl font-bold tabular-nums"
                  style={{ fontFamily: "Space Mono, monospace" }}
                >
                  {stat.count}
                  <span className="text-sm text-slate-600">/{stat.total}</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">{stat.label}</p>
              <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full"
                  style={{ width: `${(stat.count / stat.total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. Leaderboard + Race Chart ─────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-5">

        {/* Leaderboard */}
        <div className="col-span-12 lg:col-span-5">
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden h-full">
            <div className="px-5 py-4 border-b border-slate-800/60">
              <h2
                className="text-[11px] font-bold text-slate-300 tracking-widest uppercase"
                style={{ fontFamily: "Space Mono, monospace" }}
              >
                Leaderboard
              </h2>
            </div>
            <div className="divide-y divide-slate-800/40">
              {leaderboard.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setSelectedName(p.name)}
                  className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                    p.name === selectedName
                      ? "bg-orange-500/10"
                      : "hover:bg-slate-800/20"
                  }`}
                >
                  <span
                    className="text-xs text-slate-600 w-5 text-right tabular-nums shrink-0"
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {p.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold truncate ${
                          p.name === selectedName ? "text-orange-400" : "text-white"
                        }`}
                      >
                        {p.name}
                      </span>
                      {p.champAlive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 font-medium shrink-0">
                          ♛
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span
                        className="text-xs text-slate-500"
                        style={{ fontFamily: "Space Mono, monospace" }}
                      >
                        {p.points.toLocaleString()} pts
                      </span>
                      <span className="text-xs text-slate-600">PPR: {p.ppr}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{
                        fontFamily: "Space Mono, monospace",
                        color:
                          p.winProb > 15
                            ? "#34d399"
                            : p.winProb > 8
                            ? "#fbbf24"
                            : "#94a3b8",
                      }}
                    >
                      {p.winProb}%
                    </span>
                    <div className="w-16 h-1 bg-slate-800 rounded-full mt-1">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(p.winProb * 4, 100)}%`,
                          background:
                            p.winProb > 15
                              ? "#34d399"
                              : p.winProb > 8
                              ? "#fbbf24"
                              : "#64748b",
                        }}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Race Chart */}
        <div className="col-span-12 lg:col-span-7">
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden h-full">
            <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between flex-wrap gap-3">
              <h2
                className="text-[11px] font-bold text-slate-300 tracking-widest uppercase"
                style={{ fontFamily: "Space Mono, monospace" }}
              >
                Win Probability — Race Chart
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                {Object.entries(PLAYER_COLORS).map(([name, color]) => (
                  <div key={name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] text-slate-500">{name.split("-")[0]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5">
              <div className="relative h-52 bg-slate-800/30 rounded-xl overflow-hidden">
                {/* Y-axis */}
                <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between py-2 pointer-events-none">
                  {[30, 20, 10, 0].map((v) => (
                    <span
                      key={v}
                      className="text-[10px] text-slate-600 text-right pr-1"
                      style={{ fontFamily: "Space Mono, monospace" }}
                    >
                      {v}%
                    </span>
                  ))}
                </div>
                {/* Grid lines */}
                <div className="absolute left-8 right-0 top-2 bottom-6 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="border-t border-slate-700/30 w-full" />
                  ))}
                </div>
                {/* Chart lines */}
                <div className="absolute left-8 right-2 top-2 bottom-6">
                  {Object.entries(PLAYER_COLORS).map(([name, color]) => (
                    <div key={name} className="absolute inset-0">
                      <MiniChart data={WIN_PROB_HISTORY} playerKey={name} color={color} />
                    </div>
                  ))}
                </div>
                {/* X-axis labels */}
                <div className="absolute bottom-0 left-8 right-2 flex justify-between px-1">
                  {WIN_PROB_HISTORY.map((d) => (
                    <span
                      key={d.round}
                      className="text-[10px] text-slate-600"
                      style={{ fontFamily: "Space Mono, monospace" }}
                    >
                      {d.round}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. Pool Consensus ───────────────────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
        <h2
          className="text-[11px] font-bold text-slate-300 tracking-widest uppercase mb-4"
          style={{ fontFamily: "Space Mono, monospace" }}
        >
          Pool Consensus — Remaining Games
        </h2>
        <div className="space-y-3">
          {CONSENSUS.map((c, i) => (
            <div key={i} className="flex items-center gap-4">
              <span className="text-sm font-bold text-slate-300 w-28 text-right">{c.team1}</span>
              <div className="flex-1 flex h-7 rounded-full overflow-hidden bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-end pr-2 transition-all"
                  style={{ width: `${c.pct1}%` }}
                >
                  <span
                    className="text-[10px] font-bold text-white"
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {c.pct1}%
                  </span>
                </div>
                <div
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-500 flex items-center justify-start pl-2 transition-all"
                  style={{ width: `${c.pct2}%` }}
                >
                  <span
                    className="text-[10px] font-bold text-white"
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {c.pct2}%
                  </span>
                </div>
              </div>
              <span className="text-sm font-bold text-slate-300 w-28">{c.team2}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

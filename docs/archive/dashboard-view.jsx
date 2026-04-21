import { useState } from "react";

const LEADERBOARD = [
  { rank: 1, name: "erika-lenhart", points: 1370, ppr: 480, winProb: 23.4, trend: "up", champAlive: true },
  { rank: 2, name: "PayThePlayers", points: 1330, ppr: 480, winProb: 19.1, trend: "up", champAlive: true },
  { rank: 3, name: "ewolfe9", points: 1150, ppr: 640, winProb: 15.7, trend: "up", champAlive: true },
  { rank: 4, name: "Stefan G.", points: 1130, ppr: 480, winProb: 8.2, trend: "down", champAlive: false },
  { rank: 5, name: "Roberto8464", points: 1080, ppr: 320, winProb: 6.8, trend: "same", champAlive: true },
  { rank: 5, name: "DancingInDark", points: 1080, ppr: 480, winProb: 6.1, trend: "up", champAlive: true },
  { rank: 7, name: "Eric4197", points: 1030, ppr: 480, winProb: 5.3, trend: "down", champAlive: false },
  { rank: 8, name: "dukesucks15", points: 1020, ppr: 480, winProb: 4.9, trend: "same", champAlive: true },
];

const LEVERAGE_GAMES = [
  {
    matchup: "Duke vs Michigan St",
    time: "LIVE — 2nd Half",
    status: "live",
    alerts: [
      { player: "erika-lenhart", ifTeam1: 28.1, ifTeam2: 11.2, swing: 16.9 },
      { player: "ewolfe9", ifTeam1: 19.3, ifTeam2: 8.8, swing: 10.5 },
      { player: "PayThePlayers", ifTeam1: 22.7, ifTeam2: 14.1, swing: 8.6 },
    ]
  },
  {
    matchup: "Championship — TBD vs TBD",
    time: "Monday 9:00 PM ET",
    status: "upcoming",
    alerts: [
      { player: "ewolfe9", ifTeam1: 31.2, ifTeam2: 4.1, swing: 27.1 },
      { player: "erika-lenhart", ifTeam1: 26.8, ifTeam2: 18.9, swing: 7.9 },
    ]
  }
];

const CONSENSUS = [
  { game: "Duke vs Michigan St", team1: "Duke", team2: "Michigan St", pct1: 78, pct2: 22 },
];

const ELIMINATION_STATS = [
  { label: "Champion Still Alive", count: 9, total: 15, icon: "🏆" },
  { label: "Final Four Intact (3+)", count: 4, total: 15, icon: "🎯" },
  { label: "Mathematically Alive", count: 12, total: 15, icon: "📊" },
  { label: "Effectively Eliminated", count: 3, total: 15, icon: "💀" },
];

const WIN_PROB_HISTORY = [
  { round: "R64", players: { "erika-lenhart": 5.2, "PayThePlayers": 4.8, "ewolfe9": 3.1, "Stefan G.": 6.7, "Roberto8464": 2.9 }},
  { round: "R32", players: { "erika-lenhart": 8.4, "PayThePlayers": 9.1, "ewolfe9": 5.6, "Stefan G.": 11.2, "Roberto8464": 3.4 }},
  { round: "S16", players: { "erika-lenhart": 14.2, "PayThePlayers": 12.8, "ewolfe9": 9.3, "Stefan G.": 13.5, "Roberto8464": 5.1 }},
  { round: "E8", players: { "erika-lenhart": 19.8, "PayThePlayers": 16.4, "ewolfe9": 12.1, "Stefan G.": 9.8, "Roberto8464": 7.2 }},
  { round: "F4", players: { "erika-lenhart": 23.4, "PayThePlayers": 19.1, "ewolfe9": 15.7, "Stefan G.": 8.2, "Roberto8464": 6.8 }},
];

const PLAYER_COLORS = {
  "erika-lenhart": "#f97316",
  "PayThePlayers": "#06b6d4",
  "ewolfe9": "#a78bfa",
  "Stefan G.": "#f43f5e",
  "Roberto8464": "#22c55e",
};

function MiniChart({ data, playerKey, color, maxVal }) {
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (d.players[playerKey] / maxVal) * 100;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const maxProb = 35;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-lg" style={{ fontFamily: "Space Mono" }}>M</div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">NYC Madness 2025</h1>
                <p className="text-xs text-slate-500">Dashboard — Final Four in progress</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1">
              {["overview", "leverage", "trends"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${activeTab === tab ? "bg-slate-700 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>{tab}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Live Alert Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-950/40 via-red-900/20 to-slate-900/40 border border-red-800/30 p-4">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
          <div className="flex items-center gap-3 pl-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <div>
              <p className="text-sm font-bold text-red-300">Duke vs Michigan St — 2nd Half, 8:42 remaining</p>
              <p className="text-xs text-slate-400 mt-0.5">Duke leads 54-48 · This game swings win probability for 11 of 15 players</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5">

          {/* Leaderboard */}
          <div className="col-span-12 lg:col-span-5">
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800/60">
                <h2 className="text-sm font-bold text-slate-300 tracking-wide uppercase" style={{ fontFamily: "Space Mono", fontSize: 11 }}>Leaderboard</h2>
              </div>
              <div className="divide-y divide-slate-800/40">
                {LEADERBOARD.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/20 transition-colors">
                    <span className="text-xs text-slate-600 w-5 text-right tabular-nums" style={{ fontFamily: "Space Mono" }}>{p.rank}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{p.name}</span>
                        {p.champAlive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 font-medium">♛</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-slate-500" style={{ fontFamily: "Space Mono" }}>{p.points.toLocaleString()} pts</span>
                        <span className="text-xs text-slate-600">PPR: {p.ppr}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold tabular-nums" style={{ fontFamily: "Space Mono", color: p.winProb > 15 ? "#34d399" : p.winProb > 8 ? "#fbbf24" : "#94a3b8" }}>{p.winProb}%</span>
                      <div className="w-16 h-1 bg-slate-800 rounded-full mt-1">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(p.winProb * 4, 100)}%`, background: p.winProb > 15 ? "#34d399" : p.winProb > 8 ? "#fbbf24" : "#64748b" }}></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="col-span-12 lg:col-span-7 space-y-5">

            {/* Win Probability Over Time */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-300 tracking-wide uppercase" style={{ fontFamily: "Space Mono", fontSize: 11 }}>Win Probability — Race Chart</h2>
                <div className="flex items-center gap-3">
                  {Object.entries(PLAYER_COLORS).slice(0, 5).map(([name, color]) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: color }}></div>
                      <span className="text-[10px] text-slate-500">{name.split("-")[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5">
                <div className="relative h-48 bg-slate-800/30 rounded-xl overflow-hidden">
                  {/* Y-axis labels */}
                  <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between py-2">
                    {[30, 20, 10, 0].map(v => (
                      <span key={v} className="text-[10px] text-slate-600 text-right pr-1" style={{ fontFamily: "Space Mono" }}>{v}%</span>
                    ))}
                  </div>
                  {/* Chart area */}
                  <div className="absolute left-10 right-0 top-2 bottom-6">
                    {Object.entries(PLAYER_COLORS).map(([name, color]) => (
                      <div key={name} className="absolute inset-0">
                        <MiniChart data={WIN_PROB_HISTORY} playerKey={name} color={color} maxVal={maxProb} />
                      </div>
                    ))}
                  </div>
                  {/* X-axis labels */}
                  <div className="absolute bottom-0 left-10 right-0 flex justify-between px-1">
                    {WIN_PROB_HISTORY.map(d => (
                      <span key={d.round} className="text-[10px] text-slate-600" style={{ fontFamily: "Space Mono" }}>{d.round}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Leverage Alerts */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800/60">
                <h2 className="text-sm font-bold text-slate-300 tracking-wide uppercase" style={{ fontFamily: "Space Mono", fontSize: 11 }}>🎯 High Leverage Games</h2>
              </div>
              <div className="divide-y divide-slate-800/40">
                {LEVERAGE_GAMES.map((game, gi) => (
                  <div key={gi} className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      {game.status === "live" ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-bold"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" style={{animationDuration:"1.5s"}}></span>LIVE</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-medium">{game.time}</span>
                      )}
                      <span className="text-sm font-bold">{game.matchup}</span>
                    </div>
                    <div className="space-y-2">
                      {game.alerts.map((alert, ai) => (
                        <div key={ai} className="flex items-center gap-3 bg-slate-800/30 rounded-xl px-4 py-2.5">
                          <span className="text-xs font-medium text-slate-300 w-28 truncate">{alert.player}</span>
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-[10px] text-emerald-400 tabular-nums" style={{ fontFamily: "Space Mono" }}>{alert.ifTeam1}%</span>
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden relative">
                              <div className="absolute left-0 h-full bg-emerald-500/60 rounded-full" style={{ width: `${alert.ifTeam1 * 3}%` }}></div>
                              <div className="absolute right-0 h-full bg-red-500/60 rounded-full" style={{ width: `${alert.ifTeam2 * 3}%` }}></div>
                            </div>
                            <span className="text-[10px] text-red-400 tabular-nums" style={{ fontFamily: "Space Mono" }}>{alert.ifTeam2}%</span>
                          </div>
                          <div className="bg-amber-500/10 px-2 py-0.5 rounded-lg">
                            <span className="text-[10px] font-bold text-amber-400 tabular-nums" style={{ fontFamily: "Space Mono" }}>±{alert.swing}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Row — Elimination Stats + Consensus */}
          <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {ELIMINATION_STATS.map((stat) => (
              <div key={stat.label} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg">{stat.icon}</span>
                  <span className="text-2xl font-bold tabular-nums" style={{ fontFamily: "Space Mono" }}>{stat.count}<span className="text-sm text-slate-600">/{stat.total}</span></span>
                </div>
                <p className="text-xs text-slate-400 font-medium">{stat.label}</p>
                <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full" style={{ width: `${(stat.count / stat.total) * 100}%` }}></div>
                </div>
              </div>
            ))}
          </div>

          {/* Consensus Picks */}
          <div className="col-span-12">
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-slate-300 tracking-wide uppercase mb-4" style={{ fontFamily: "Space Mono", fontSize: 11 }}>Pool Consensus — Remaining Games</h2>
              {CONSENSUS.map((c, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-300 w-24 text-right">{c.team1}</span>
                  <div className="flex-1 flex h-6 rounded-full overflow-hidden bg-slate-800">
                    <div className="h-full bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-end pr-2 transition-all" style={{ width: `${c.pct1}%` }}>
                      <span className="text-[10px] font-bold text-white" style={{ fontFamily: "Space Mono" }}>{c.pct1}%</span>
                    </div>
                    <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-500 flex items-center justify-start pl-2 transition-all" style={{ width: `${c.pct2}%` }}>
                      <span className="text-[10px] font-bold text-white" style={{ fontFamily: "Space Mono" }}>{c.pct2}%</span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-300 w-24">{c.team2}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

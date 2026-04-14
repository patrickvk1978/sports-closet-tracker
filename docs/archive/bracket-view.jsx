import { useState } from "react";

const REGIONS = {
  midwest: {
    name: "Midwest",
    color: "#f97316",
    seeds: [
      { seed: 1, team: "Kentucky", eliminated: false },
      { seed: 16, team: "Hampton", eliminated: true },
      { seed: 8, team: "Cincinnati", eliminated: true },
      { seed: 9, team: "Purdue", eliminated: true },
      { seed: 5, team: "West Virginia", eliminated: true },
      { seed: 12, team: "Buffalo", eliminated: true },
      { seed: 4, team: "Maryland", eliminated: true },
      { seed: 13, team: "Valparaiso", eliminated: true },
      { seed: 6, team: "Butler", eliminated: true },
      { seed: 11, team: "Texas", eliminated: true },
      { seed: 3, team: "Notre Dame", eliminated: true },
      { seed: 14, team: "Northeastern", eliminated: true },
      { seed: 7, team: "Wichita St", eliminated: true },
      { seed: 10, team: "Indiana", eliminated: true },
      { seed: 2, team: "Kansas", eliminated: true },
      { seed: 15, team: "New Mexico St", eliminated: true },
    ]
  },
  west: {
    name: "West",
    color: "#06b6d4",
    seeds: [
      { seed: 1, team: "Wisconsin", eliminated: false },
      { seed: 16, team: "Coastal Car.", eliminated: true },
      { seed: 8, team: "Oregon", eliminated: true },
      { seed: 9, team: "Oklahoma St", eliminated: true },
      { seed: 5, team: "Arkansas", eliminated: true },
      { seed: 12, team: "Wofford", eliminated: true },
      { seed: 4, team: "North Carolina", eliminated: true },
      { seed: 13, team: "Harvard", eliminated: true },
      { seed: 6, team: "Xavier", eliminated: true },
      { seed: 11, team: "Ole Miss", eliminated: true },
      { seed: 3, team: "Baylor", eliminated: true },
      { seed: 14, team: "Georgia St", eliminated: true },
      { seed: 7, team: "VCU", eliminated: true },
      { seed: 10, team: "Ohio St", eliminated: true },
      { seed: 2, team: "Arizona", eliminated: true },
      { seed: 15, team: "Texas Southern", eliminated: true },
    ]
  },
  south: {
    name: "South",
    color: "#a78bfa",
    seeds: [
      { seed: 1, team: "Duke", eliminated: false },
      { seed: 16, team: "R. Morris", eliminated: true },
      { seed: 8, team: "San Diego St", eliminated: true },
      { seed: 9, team: "St. John's", eliminated: true },
      { seed: 5, team: "Utah", eliminated: true },
      { seed: 12, team: "SF Austin", eliminated: true },
      { seed: 4, team: "Georgetown", eliminated: true },
      { seed: 13, team: "E. Washington", eliminated: true },
      { seed: 6, team: "SMU", eliminated: true },
      { seed: 11, team: "UCLA", eliminated: true },
      { seed: 3, team: "Iowa St", eliminated: true },
      { seed: 14, team: "UAB", eliminated: true },
      { seed: 7, team: "Iowa", eliminated: true },
      { seed: 10, team: "Davidson", eliminated: true },
      { seed: 2, team: "Gonzaga", eliminated: true },
      { seed: 15, team: "N. Dakota St", eliminated: true },
    ]
  },
  east: {
    name: "East",
    color: "#22c55e",
    seeds: [
      { seed: 1, team: "Villanova", eliminated: true },
      { seed: 16, team: "Lafayette", eliminated: true },
      { seed: 8, team: "NC State", eliminated: true },
      { seed: 9, team: "LSU", eliminated: true },
      { seed: 5, team: "Northern Iowa", eliminated: true },
      { seed: 12, team: "Wyoming", eliminated: true },
      { seed: 4, team: "Louisville", eliminated: true },
      { seed: 13, team: "UC Irvine", eliminated: true },
      { seed: 6, team: "Providence", eliminated: true },
      { seed: 11, team: "Dayton", eliminated: true },
      { seed: 3, team: "Oklahoma", eliminated: true },
      { seed: 14, team: "Albany", eliminated: true },
      { seed: 7, team: "Michigan St", eliminated: false },
      { seed: 10, team: "Georgia", eliminated: true },
      { seed: 2, team: "Virginia", eliminated: true },
      { seed: 15, team: "Belmont", eliminated: true },
    ]
  }
};

const FINAL_FOUR = [
  { game: 1, team1: "Kentucky", seed1: 1, team2: "Wisconsin", seed2: 1, winner: "Wisconsin", status: "final" },
  { game: 2, team1: "Duke", seed1: 1, team2: "Michigan St", seed2: 7, winner: null, status: "live" },
];

const CHAMPIONSHIP = { team1: "Wisconsin", team2: "TBD", winner: null, status: "pending" };

function TeamSlot({ team, seed, eliminated, alive, isWinner, regionColor, onClick, isSelected }) {
  let bg = "bg-slate-800/60";
  let textColor = "text-slate-300";
  let border = "border-slate-700/50";

  if (eliminated) {
    bg = "bg-slate-900/40";
    textColor = "text-slate-600 line-through";
    border = "border-slate-800/30";
  } else if (isWinner) {
    bg = "bg-emerald-900/30";
    textColor = "text-emerald-300";
    border = "border-emerald-700/40";
  } else if (alive) {
    bg = "bg-slate-800/80";
    textColor = "text-white";
    border = "border-slate-600/50";
  }

  if (isSelected) {
    border = `border-2`;
    bg = "bg-orange-500/10";
  }

  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${bg} border ${border} transition-all hover:brightness-110 cursor-pointer w-full text-left`}>
      <span className="text-[10px] font-bold text-slate-500 w-4 text-center tabular-nums" style={{ fontFamily: "Space Mono" }}>{seed}</span>
      <span className={`text-xs font-medium ${textColor} truncate`}>{team}</span>
    </button>
  );
}

export default function BracketView() {
  const [selectedPlayer, setSelectedPlayer] = useState("erika-lenhart");
  const [viewMode, setViewMode] = useState("results");
  const [expandedRegion, setExpandedRegion] = useState(null);

  const players = [
    "erika-lenhart", "PayThePlayers", "ewolfe9", "Stefan G.",
    "Roberto8464", "DancingInDark", "Eric4197", "dukesucks15"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold" style={{ fontFamily: "Space Mono" }}>M</div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">NYC Madness 2025</h1>
                <p className="text-xs text-slate-500">Bracket View</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1">
                {["results", "my picks"].map(mode => (
                  <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${viewMode === mode ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>{mode}</button>
                ))}
              </div>
              <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)} className="bg-slate-800 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-500">
                {players.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Final Four + Championship — Center Stage */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-700"></div>
            <h2 className="text-sm font-bold text-slate-400 tracking-widest uppercase px-4" style={{ fontFamily: "Space Mono" }}>Final Four & Championship</h2>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-700"></div>
          </div>

          <div className="flex items-center justify-center gap-4">
            {/* FF Game 1 */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 w-56">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 text-[10px] font-medium">Final</span>
                <span className="text-[10px] text-slate-600">Semifinal 1</span>
              </div>
              <div className="space-y-2">
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${FINAL_FOUR[0].winner === "Kentucky" ? "bg-emerald-900/30 border border-emerald-700/30" : "bg-slate-800/40 border border-slate-700/30"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-bold" style={{ fontFamily: "Space Mono" }}>1</span>
                    <span className={`text-sm font-semibold ${FINAL_FOUR[0].winner === "Kentucky" ? "text-emerald-300" : "text-red-400 line-through opacity-60"}`}>Kentucky</span>
                  </div>
                </div>
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${FINAL_FOUR[0].winner === "Wisconsin" ? "bg-emerald-900/30 border border-emerald-700/30" : "bg-slate-800/40 border border-slate-700/30"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-bold" style={{ fontFamily: "Space Mono" }}>1</span>
                    <span className={`text-sm font-semibold ${FINAL_FOUR[0].winner === "Wisconsin" ? "text-emerald-300" : "text-red-400 line-through opacity-60"}`}>Wisconsin</span>
                  </div>
                  <span className="text-[10px] text-emerald-500">✓</span>
                </div>
              </div>
            </div>

            {/* Championship */}
            <div className="bg-gradient-to-b from-amber-900/20 to-slate-900/60 border border-amber-700/30 rounded-2xl p-5 w-64 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-amber-600 to-orange-600 rounded-full">
                <span className="text-[10px] font-bold text-white tracking-widest uppercase" style={{ fontFamily: "Space Mono" }}>Championship</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
                  <span className="text-sm font-bold text-white">Wisconsin</span>
                  <span className="text-[10px] text-slate-500">Midwest/West</span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-xs text-slate-600 font-medium">vs</span>
                </div>
                <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-slate-800/50 border border-amber-700/20 animate-pulse" style={{ animationDuration: "3s" }}>
                  <span className="text-sm font-bold text-amber-300">TBD</span>
                  <span className="text-[10px] text-slate-500">South/East</span>
                </div>
              </div>
              <div className="mt-3 text-center">
                <span className="text-xs text-slate-500">Monday 9:00 PM ET</span>
              </div>
            </div>

            {/* FF Game 2 */}
            <div className="bg-slate-900/60 border border-red-800/20 rounded-2xl p-4 w-56 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500 animate-pulse"></div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" style={{animationDuration:"1.5s"}}></span>LIVE
                </span>
                <span className="text-[10px] text-slate-600">Semifinal 2</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-bold" style={{ fontFamily: "Space Mono" }}>1</span>
                    <span className="text-sm font-semibold text-white">Duke</span>
                  </div>
                  <span className="text-xs font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono" }}>54</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-bold" style={{ fontFamily: "Space Mono" }}>7</span>
                    <span className="text-sm font-semibold text-white">Michigan St</span>
                  </div>
                  <span className="text-xs font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono" }}>48</span>
                </div>
              </div>
              <div className="mt-2 text-center">
                <span className="text-[10px] text-red-400 font-medium" style={{ fontFamily: "Space Mono" }}>2nd Half — 8:42</span>
              </div>
            </div>
          </div>
        </div>

        {/* Regional Brackets */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(REGIONS).map(([key, region]) => {
            const isExpanded = expandedRegion === key;
            const aliveTeams = region.seeds.filter(s => !s.eliminated);
            return (
              <div key={key} onClick={() => setExpandedRegion(isExpanded ? null : key)} className="cursor-pointer">
                <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden hover:border-slate-700/80 transition-all">
                  {/* Region header */}
                  <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between" style={{ borderLeftWidth: 3, borderLeftColor: region.color }}>
                    <div>
                      <h3 className="text-sm font-bold" style={{ color: region.color }}>{region.name}</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">{aliveTeams.length} team{aliveTeams.length !== 1 ? "s" : ""} alive</p>
                    </div>
                    <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {/* Teams */}
                  <div className={`divide-y divide-slate-800/30 ${isExpanded ? "" : "max-h-48 overflow-hidden"}`}>
                    {region.seeds.map((team, i) => (
                      <div key={i} className={`flex items-center gap-2 px-4 py-2 ${team.eliminated ? "opacity-40" : ""}`}>
                        <span className="text-[10px] font-bold text-slate-600 w-4 text-right tabular-nums" style={{ fontFamily: "Space Mono" }}>{team.seed}</span>
                        <span className={`text-xs font-medium ${team.eliminated ? "text-slate-600 line-through" : "text-white"}`}>{team.team}</span>
                        {!team.eliminated && <span className="ml-auto text-emerald-500 text-[10px]">●</span>}
                      </div>
                    ))}
                  </div>

                  {!isExpanded && region.seeds.length > 8 && (
                    <div className="px-4 py-2 text-center">
                      <span className="text-[10px] text-slate-600">Tap to expand</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Player's Bracket Summary */}
        <div className="mt-6 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-300">{selectedPlayer}'s Bracket</h3>
              <p className="text-xs text-slate-500 mt-0.5">Key picks and accuracy</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-lg font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono" }}>1,370</p>
                <p className="text-[10px] text-slate-500">Points</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-emerald-400 tabular-nums" style={{ fontFamily: "Space Mono" }}>23.4%</p>
                <p className="text-[10px] text-slate-500">Win Prob</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Champion", pick: "Duke", alive: true },
              { label: "Runner-Up", pick: "Kentucky", alive: true },
              { label: "Final Four", pick: "Wisconsin", alive: true },
              { label: "Final Four", pick: "Virginia", alive: false },
            ].map((p, i) => (
              <div key={i} className={`rounded-xl px-4 py-3 ${p.alive ? "bg-slate-800/50 border border-slate-700/40" : "bg-slate-900/40 border border-slate-800/30"}`}>
                <p className="text-[10px] text-slate-500 mb-1 font-medium">{p.label}</p>
                <p className={`text-sm font-bold ${p.alive ? "text-white" : "text-red-400 line-through opacity-60"}`}>{p.pick}</p>
                {p.alive ? <span className="text-[10px] text-emerald-400 mt-1 block">● Still alive</span> : <span className="text-[10px] text-red-400 mt-1 block">✕ Eliminated</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

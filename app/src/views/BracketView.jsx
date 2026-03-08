import { useState, useMemo } from "react";
import { usePoolData } from "../hooks/usePoolData";

// ─── Constants ─────────────────────────────────────────────────────────────────

const REGION_KEYS  = ["midwest", "west", "south", "east"];
const ROUND_KEYS   = ["R64", "R32", "S16", "E8"];
const ROUND_LABELS = { R64: "R64", R32: "R32", S16: "Sweet 16", E8: "Elite 8" };

// Height of the game area (excluding round labels). With 8 R64 games this gives
// each game 65px of vertical space, which fits the compact two-row card.
const GAME_AREA_H = 520;
const LABEL_H     = 28;

// ─── Helpers ───────────────────────────────────────────────────────────────────

// KEY_PICKS and ALIVE are computed inside the component from live data (see below).

// ─── Sub-components ────────────────────────────────────────────────────────────

function TeamRow({ team, seed, isWinner, status }) {
  let textCls = "text-slate-400";
  let bgCls   = "";

  if (status === "live") {
    textCls = "text-amber-200";
    bgCls   = "bg-amber-900/10";
  } else if (status === "final") {
    if (isWinner) {
      textCls = "text-emerald-300 font-semibold";
      bgCls   = "bg-emerald-900/20";
    } else {
      textCls = "text-slate-600 line-through";
    }
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-[5px] ${bgCls}`}>
      <span
        className="text-[10px] text-slate-600 w-3 text-center tabular-nums shrink-0"
        style={{ fontFamily: "Space Mono, monospace" }}
      >
        {seed}
      </span>
      <span className={`text-[11px] truncate flex-1 ${textCls}`}>{team || "TBD"}</span>
      {isWinner && status === "final" && (
        <span className="text-emerald-500 text-[10px] shrink-0">✓</span>
      )}
    </div>
  );
}

function GameCard({ game }) {
  const { t1, s1, t2, s2, winner, status } = game;
  return (
    <div className="bg-slate-900/80 border border-slate-800/60 rounded-lg overflow-hidden" style={{ width: 128 }}>
      <TeamRow team={t1} seed={s1} isWinner={winner === t1} status={status} />
      <div className="h-px bg-slate-800/80" />
      <TeamRow team={t2} seed={s2} isWinner={winner === t2} status={status} />
    </div>
  );
}

// SVG connector lines between adjacent round columns.
// leftCount = number of games in left column; draws leftCount/2 bracket shapes.
function BracketConnectors({ leftCount }) {
  const rightCount = leftCount / 2;
  const segments   = [];

  for (let i = 0; i < rightCount; i++) {
    const topY = ((i * 2)     * 2 + 1) / (leftCount * 2) * 100;
    const botY = ((i * 2 + 1) * 2 + 1) / (leftCount * 2) * 100;
    const midY = (topY + botY) / 2;
    // Two horizontal lines + vertical bracket + exit line
    segments.push(
      `M 0 ${topY} H 50 V ${botY} M 0 ${botY} H 50 M 50 ${midY} H 100`
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ width: 20, height: GAME_AREA_H, flexShrink: 0 }}
    >
      {segments.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke="rgba(71,85,105,0.55)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

// ─── Region Bracket ────────────────────────────────────────────────────────────

const GAME_COUNTS = { R64: 8, R32: 4, S16: 2, E8: 1 };

function RegionBracket({ region }) {
  if (!region) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-slate-500">No bracket data for this region yet.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex" style={{ minWidth: 580 }}>

        {ROUND_KEYS.map((round, ri) => (
          <div key={round} className="flex">

            {/* Round column */}
            <div style={{ width: 132, flexShrink: 0 }}>
              {/* Label */}
              <div
                className="flex items-center justify-center"
                style={{ height: LABEL_H }}
              >
                <span
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                  style={{ fontFamily: "Space Mono, monospace" }}
                >
                  {ROUND_LABELS[round]}
                </span>
              </div>
              {/* Games — justify-around gives correct vertical alignment */}
              <div
                style={{
                  height: GAME_AREA_H,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-around",
                }}
              >
                {((region.rounds ?? {})[round] || []).map((game, gi) => (
                  <GameCard key={gi} game={game} />
                ))}
              </div>
            </div>

            {/* Connector SVG (not after last column) */}
            {ri < ROUND_KEYS.length - 1 && (
              <div style={{ paddingTop: LABEL_H }}>
                <BracketConnectors leftCount={GAME_COUNTS[round]} />
              </div>
            )}
          </div>
        ))}

      </div>
    </div>
  );
}

// ─── Final Four Tab ────────────────────────────────────────────────────────────

function FinalFourView() {
  return (
    <div className="py-8 flex flex-col items-center gap-8">

      {/* Semis */}
      <div className="flex items-center gap-8 flex-wrap justify-center">

        {/* SF1 — Final */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 w-60">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 text-[10px] font-medium">Final</span>
            <span className="text-[10px] text-slate-600">Semifinal 1</span>
          </div>
          {[
            { seed: 1, team: "Kentucky",  winner: false },
            { seed: 1, team: "Wisconsin", winner: true  },
          ].map(({ seed, team, winner }) => (
            <div
              key={team}
              className={`flex items-center justify-between px-3 py-3 rounded-xl mb-2 ${
                winner
                  ? "bg-emerald-900/30 border border-emerald-700/30"
                  : "bg-slate-800/40 border border-slate-700/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-bold" style={{ fontFamily: "Space Mono, monospace" }}>{seed}</span>
                <span className={`text-sm font-semibold ${winner ? "text-emerald-300" : "text-red-400 line-through opacity-60"}`}>
                  {team}
                </span>
              </div>
              {winner && <span className="text-[10px] text-emerald-500">✓</span>}
            </div>
          ))}
        </div>

        {/* Championship */}
        <div className="bg-gradient-to-b from-amber-900/20 to-slate-900/60 border border-amber-700/30 rounded-2xl p-5 w-64 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-amber-600 to-orange-600 rounded-full whitespace-nowrap">
            <span className="text-[10px] font-bold text-white tracking-widest uppercase" style={{ fontFamily: "Space Mono, monospace" }}>
              Championship
            </span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
              <span className="text-sm font-bold text-white">Wisconsin</span>
              <span className="text-[10px] text-slate-500">West · #1</span>
            </div>
            <div className="flex items-center justify-center">
              <span className="text-xs text-slate-600 font-medium">vs</span>
            </div>
            <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-slate-800/50 border border-amber-700/20 animate-pulse" style={{ animationDuration: "3s" }}>
              <span className="text-sm font-bold text-amber-300">TBD</span>
              <span className="text-[10px] text-slate-500">South/East</span>
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-500 mt-3">Monday · 9:00 PM ET</p>
        </div>

        {/* SF2 — Live */}
        <div className="bg-slate-900/60 border border-red-800/30 rounded-2xl p-5 w-60 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500 animate-pulse" />
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" style={{ animationDuration: "1.5s" }} />
              LIVE
            </span>
            <span className="text-[10px] text-slate-600">Semifinal 2</span>
          </div>
          {[
            { seed: 1, team: "Duke",        score: 54 },
            { seed: 7, team: "Michigan St",  score: 48 },
          ].map(({ seed, team, score }) => (
            <div key={team} className="flex items-center justify-between px-3 py-3 rounded-xl bg-slate-800/60 border border-slate-700/40 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-bold" style={{ fontFamily: "Space Mono, monospace" }}>{seed}</span>
                <span className="text-sm font-semibold text-white">{team}</span>
              </div>
              <span className="text-sm font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>{score}</span>
            </div>
          ))}
          <p className="text-center text-[10px] text-red-400 font-medium mt-1" style={{ fontFamily: "Space Mono, monospace" }}>
            2nd Half — 8:42
          </p>
        </div>

      </div>
    </div>
  );
}

// ─── Player Picks Summary ──────────────────────────────────────────────────────

function PickCard({ label, pick, alive }) {
  const hasPick = !!pick;
  return (
    <div className={`rounded-xl px-4 py-3 ${hasPick && alive ? "bg-slate-800/50 border border-slate-700/40" : "bg-slate-900/40 border border-slate-800/30"}`}>
      <p className="text-[10px] text-slate-500 mb-1 font-medium">{label}</p>
      <p className={`text-sm font-bold ${
        !hasPick ? "text-slate-600 italic" :
        alive ? "text-white" : "text-red-400 line-through opacity-60"
      }`}>{pick ?? "—"}</p>
      {hasPick
        ? alive
          ? <span className="text-[10px] text-emerald-400 mt-1 block">● Still alive</span>
          : <span className="text-[10px] text-red-400 mt-1 block">✕ Eliminated</span>
        : <span className="text-[10px] text-slate-600 mt-1 block">No pick</span>
      }
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const TABS = [
  { key: "midwest",   label: "Midwest",    color: "#f97316" },
  { key: "west",      label: "West",       color: "#06b6d4" },
  { key: "south",     label: "South",      color: "#a78bfa" },
  { key: "east",      label: "East",       color: "#22c55e" },
  { key: "finalfour", label: "Final Four", color: "#f59e0b" },
];

export default function BracketView() {
  const { BRACKET, PLAYERS, GAMES } = usePoolData();

  // Compute KEY_PICKS from live PLAYERS data
  // picks[]: [e8_midwest, e8_west, e8_east, e8_south, f4_sf1, f4_sf2, champ]
  const KEY_PICKS = useMemo(() => {
    const result = {};
    PLAYERS.forEach((player) => {
      const [e8mw, e8w, e8e, e8s, sf1, sf2, champ] = player.picks;
      const runnerUp  = sf1 === champ ? (sf2 ?? null) : (sf1 ?? null);
      const sf1Loser  = e8mw === sf1  ? e8w : e8mw;
      const sf2Loser  = e8s  === sf2  ? e8e : e8s;
      result[player.name] = {
        champion: champ   ?? null,
        runnerUp: runnerUp ?? null,
        ff: [sf1Loser, sf2Loser].filter(Boolean),
      };
    });
    return result;
  }, [PLAYERS]);

  // Compute ALIVE: teams not yet eliminated in any final game
  const ALIVE = useMemo(() => {
    const eliminated = new Set();
    for (const regionKey of REGION_KEYS) {
      const region = BRACKET[regionKey];
      if (!region) continue;
      for (const games of Object.values(region.rounds ?? {})) {
        for (const game of games) {
          if (game.status === "final" && game.winner) {
            const loser = game.t1 === game.winner ? game.t2 : game.t1;
            if (loser) eliminated.add(loser);
          }
        }
      }
    }
    GAMES.forEach((game) => {
      if (game.status === "final" && game.winner) {
        const loser = game.team1 === game.winner ? game.team2 : game.team1;
        if (loser) eliminated.add(loser);
      }
    });
    // Collect all team names from bracket, minus eliminated
    const alive = new Set();
    for (const regionKey of REGION_KEYS) {
      const region = BRACKET[regionKey];
      if (!region) continue;
      for (const games of Object.values(region.rounds ?? {})) {
        for (const game of games) {
          if (game.t1 && !eliminated.has(game.t1)) alive.add(game.t1);
          if (game.t2 && !eliminated.has(game.t2)) alive.add(game.t2);
        }
      }
    }
    return alive;
  }, [BRACKET, GAMES]);

  const PLAYER_NAMES = PLAYERS.map((p) => p.name);

  const [activeTab,      setActiveTab]      = useState("midwest");
  const [selectedPlayer, setSelectedPlayer] = useState(() => PLAYER_NAMES[0] ?? "");

  const playerData = PLAYERS.find((p) => p.name === selectedPlayer) ?? PLAYERS[0] ?? null;
  const keyPicks   = KEY_PICKS[selectedPlayer] ?? KEY_PICKS[PLAYER_NAMES[0]] ?? { champion: null, runnerUp: null, ff: [] };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* Player selector */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="text-base font-bold text-white">Bracket View</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Viewing:</label>
          <select
            value={selectedPlayer}
            onChange={(e) => setSelectedPlayer(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
          >
            {PLAYER_NAMES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Player picks summary strip */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 mb-5">
        {playerData ? (
          <>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-300">{selectedPlayer}</p>
                  <p className="text-[10px] text-slate-500">Key picks</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                      {playerData.points.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500">Points</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-400 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                      {playerData.winProb}%
                    </p>
                    <p className="text-[10px] text-slate-500">Win Prob</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <PickCard label="Champion"   pick={keyPicks.champion}  alive={ALIVE.has(keyPicks.champion)} />
              <PickCard label="Runner-Up"  pick={keyPicks.runnerUp}  alive={ALIVE.has(keyPicks.runnerUp)} />
              <PickCard label="Final Four" pick={keyPicks.ff[0]}     alive={ALIVE.has(keyPicks.ff[0])} />
              <PickCard label="Final Four" pick={keyPicks.ff[1]}     alive={ALIVE.has(keyPicks.ff[1])} />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 text-center py-2">No bracket data yet.</p>
        )}
      </div>

      {/* Region / Final Four tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? "text-white"
                : "bg-slate-800/50 text-slate-400 hover:text-white"
            }`}
            style={
              activeTab === tab.key
                ? { background: `${tab.color}22`, border: `1px solid ${tab.color}44`, color: tab.color }
                : {}
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bracket content */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl overflow-hidden">
        {activeTab === "finalfour" ? (
          <FinalFourView />
        ) : (
          <div className="p-4">
            <RegionBracket region={BRACKET[activeTab]} />
          </div>
        )}
      </div>

    </div>
  );
}

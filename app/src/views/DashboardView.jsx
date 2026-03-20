import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

// ─── Pre-game gate ────────────────────────────────────────────────────────────
const FIRST_TIPOFF = new Date("2026-03-19T12:15:00-04:00");

function useCountdown(target) {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, target - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setTimeLeft(Math.max(0, target - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  return {
    days:  Math.floor(timeLeft / 86_400_000),
    hours: Math.floor((timeLeft % 86_400_000) / 3_600_000),
    mins:  Math.floor((timeLeft % 3_600_000)  / 60_000),
    secs:  Math.floor((timeLeft % 60_000)     / 1_000),
    done:  timeLeft === 0,
  };
}

function CountdownUnit({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="text-4xl font-bold text-white tabular-nums leading-none"
        style={{ fontFamily: "Space Mono, monospace" }}
      >
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
    </div>
  );
}

function PreGameScreen({ pool, playerCount, hasBracket, ownerName, onLeavePool }) {
  const { days, hours, mins, secs, done } = useCountdown(FIRST_TIPOFF);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-3 flex items-center gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white truncate">{pool?.name ?? "Pool"}</h2>
          {ownerName && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Commissioner: <span className="text-slate-400">{ownerName}</span>
            </p>
          )}
        </div>
        <span className="text-xs text-slate-500 shrink-0">
          {playerCount} {playerCount === 1 ? "entry" : "entries"}
        </span>
      </div>

      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-10 flex flex-col items-center text-center gap-8">
        <div className="space-y-2">
          <div className="text-4xl">🏀</div>
          <h1 className="text-2xl font-bold text-white">Dashboard Goes Live When Games Start</h1>
          <p className="text-sm text-slate-400">
            Win probabilities, leverage games, and leaderboard unlock on tip-off.
          </p>
        </div>

        {done ? (
          <p className="text-orange-400 font-semibold">Games are underway — check back shortly!</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-slate-500">First tip-off · Thu Mar 19</p>
            <div className="flex items-start gap-5">
              <CountdownUnit value={days}  label="days"    />
              <span className="text-2xl font-bold text-slate-600 mt-1">:</span>
              <CountdownUnit value={hours} label="hours"   />
              <span className="text-2xl font-bold text-slate-600 mt-1">:</span>
              <CountdownUnit value={mins}  label="minutes" />
              <span className="text-2xl font-bold text-slate-600 mt-1">:</span>
              <CountdownUnit value={secs}  label="seconds" />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            to="/submit"
            className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {hasBracket ? "Edit Your Bracket" : "Submit Your Bracket"} →
          </Link>
          <Link
            to="/bracket"
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition-colors"
          >
            View Bracket
          </Link>
          <Link
            to="/matrix"
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition-colors"
          >
            View Pick Matrix
          </Link>
          <button
            onClick={onLeavePool}
            className="px-5 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-500 hover:text-red-400 text-sm font-semibold rounded-xl transition-colors"
          >
            Leave Pool
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function LivePing() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
    </span>
  );
}

function DeltaArrow({ delta, className = "" }) {
  if (delta == null || delta === 0) return null;
  const isUp = delta > 0;
  return (
    <span className={`text-xs font-bold tabular-nums ${isUp ? "text-emerald-400" : "text-red-400"} ${className}`} style={{ fontFamily: "Space Mono, monospace" }}>
      {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{delta}
    </span>
  );
}

function shortTeam(name) {
  if (!name) return 'TBD';
  return name.split(' ').pop();
}

// ─── 1. Stat Bar ─────────────────────────────────────────────────────────────

function StatBar({ player, poolSize, bestPath }) {
  if (!player) return null;
  const winProbColor = player.winProb > 15 ? "text-emerald-400" : player.winProb > 8 ? "text-amber-400" : "text-slate-400";

  // Compress best path into "Need: X, Y, Z"
  const needs = (bestPath || [])
    .slice(0, 3)
    .map(b => b.text.replace(/ wins the championship$/i, ' champ')
                     .replace(/ reaches the Final Four$/i, ' F4')
                     .replace(/ wins the (Midwest|West|South|East)$/i, (_, r) => ` ${r.slice(0, 2).toUpperCase()}`))

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Rank */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-2xl font-bold text-white tabular-nums leading-none" style={{ fontFamily: "Space Mono, monospace" }}>
            #{player.rank}
          </span>
          <span className="text-[10px] text-slate-500">of {poolSize}</span>
        </div>

        <div className="w-px h-6 bg-slate-700/60 shrink-0 hidden sm:block" />

        {/* Points + Win Prob */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-white tabular-nums leading-none" style={{ fontFamily: "Space Mono, monospace" }}>
              {player.points.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-500">pts</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-lg font-bold tabular-nums leading-none ${winProbColor}`} style={{ fontFamily: "Space Mono, monospace" }}>
              {player.winProb}%
            </span>
            <DeltaArrow delta={player.winProbDelta} />
          </div>
          {player.champAlive ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 font-semibold border border-emerald-800/40">
              ♛ alive
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 font-semibold border border-red-800/30">
              ♛ eliminated
            </span>
          )}
        </div>

        {/* Needs */}
        {needs.length > 0 && (
          <>
            <div className="w-px h-6 bg-slate-700/60 shrink-0 hidden sm:block" />
            <div className="text-[11px] text-slate-400">
              <span className="text-slate-500">Need: </span>
              {needs.join(', ')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 2. Narrative Card ───────────────────────────────────────────────────────

function NarrativeCard({ poolNarrative, playerNarrative, hasLiveGames }) {
  // During live action: show player narrative (game reactions)
  // No live games / morning: show pool narrative (morning briefing)
  const narrative = hasLiveGames ? (playerNarrative || poolNarrative) : (poolNarrative || playerNarrative);
  const label = hasLiveGames ? 'Latest Update' : 'Morning Briefing';

  if (!narrative) return null;

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-3">
      <p className="text-sm text-slate-200 leading-relaxed">{narrative}</p>
      <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
        {label}
      </p>
    </div>
  );
}

// ─── 3. Score Grid ───────────────────────────────────────────────────────────

function parseGameTimeToMs(gameTime) {
  // Parse "3:30 PM ET" or "Thu 3:30 PM ET" into a Date for today
  if (!gameTime) return null;
  try {
    // Strip day prefix if present (e.g. "Thu ")
    const cleaned = gameTime.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/i, '');
    const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*ET$/i);
    if (!match) return null;
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const now = new Date();
    // Build a date for today in ET (approximate — good enough for 5-min window)
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins);
    // Adjust for ET offset (~UTC-4 or UTC-5). Rough: use local time comparison.
    return d.getTime();
  } catch {
    return null;
  }
}

const FINAL_SEEN_KEY = 'scoregrid_final_seen';

function loadFinalSeen() {
  try {
    return JSON.parse(localStorage.getItem(FINAL_SEEN_KEY) || '{}');
  } catch { return {}; }
}

function saveFinalSeen(map) {
  try { localStorage.setItem(FINAL_SEEN_KEY, JSON.stringify(map)); } catch {}
}

function ScoreGrid({ games, leverageGames, playerLeverage, player, players }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Track when games first appear as final — persisted in localStorage
  useEffect(() => {
    const seen = loadFinalSeen();
    let changed = false;
    for (const game of games) {
      if (game.status === 'final' && !seen[game.slot_index]) {
        seen[game.slot_index] = Date.now();
        changed = true;
      }
    }
    if (changed) saveFinalSeen(seen);
  }, [games]);

  const cards = useMemo(() => {
    // Build leverage lookup by slot_index
    const leverageBySlot = {};
    for (const lg of (leverageGames || [])) {
      leverageBySlot[lg.id] = lg;
    }
    // Also check player-specific leverage
    const playerGames = playerLeverage?.[player?.name] || [];
    for (const pg of playerGames) {
      if (!leverageBySlot[pg.id]) leverageBySlot[pg.id] = pg;
    }

    const result = [];
    for (const game of games) {
      if (!game.team1 || !game.team2 || game.team1 === 'TBD' || game.team2 === 'TBD') continue;

      let include = false;
      let cardType = 'pending'; // live | final | upcoming

      if (game.status === 'live') {
        include = true;
        cardType = 'live';
      } else if (game.status === 'final') {
        // Show recently-final games (within 15 min of when we FIRST saw them as final)
        const seen = loadFinalSeen();
        const firstSeen = seen[game.slot_index];
        if (firstSeen) {
          const minsSinceFirstSeen = (now - firstSeen) / 60000;
          if (minsSinceFirstSeen <= 15) {
            include = true;
            cardType = 'final';
          }
        }
      } else if (game.status === 'pending') {
        // Show upcoming within 15 minutes of tip
        const tipMs = parseGameTimeToMs(game.gameTime);
        if (tipMs) {
          const minsUntil = (tipMs - now) / 60000;
          if (minsUntil >= 0 && minsUntil <= 15) {
            include = true;
            cardType = 'upcoming';
          }
        }
      }

      if (!include) continue;

      // Get leverage data for this game
      const lg = leverageBySlot[game.slot_index];
      const impact = lg?.playerImpacts?.find(p => p.player === player?.name);

      // Player delta from current win prob (root-for = team with higher upside)
      let playerDelta = null;
      let playerRootFor = null;
      if (impact && player?.winProb != null) {
        const deltaT1 = impact.ifTeam1 - player.winProb;
        const deltaT2 = impact.ifTeam2 - player.winProb;
        if (deltaT1 >= deltaT2) {
          playerDelta = deltaT1;
          playerRootFor = game.abbrev1 || shortTeam(game.team1);
        } else {
          playerDelta = deltaT2;
          playerRootFor = game.abbrev2 || shortTeam(game.team2);
        }
      }

      // Pool impacts: top 2 most impacted other players (≥1% absolute delta)
      let poolImpacts = [];
      if (lg?.playerImpacts) {
        for (const imp of lg.playerImpacts) {
          if (imp.player === player?.name) continue;
          const p = players.find(pl => pl.name === imp.player);
          if (!p) continue;
          const d1 = imp.ifTeam1 - (p.winProb ?? 0);
          const d2 = imp.ifTeam2 - (p.winProb ?? 0);
          // Pick the outcome with the largest absolute delta
          const absD1 = Math.abs(d1), absD2 = Math.abs(d2);
          if (Math.max(absD1, absD2) < 1) continue;
          const delta = absD1 >= absD2 ? d1 : d2;
          const team  = absD1 >= absD2 ? (game.abbrev1 || shortTeam(game.team1)) : (game.abbrev2 || shortTeam(game.team2));
          poolImpacts.push({ name: imp.player, delta, team });
        }
        poolImpacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        poolImpacts = poolImpacts.slice(0, 2);
      }

      result.push({ game, cardType, impact, playerDelta, playerRootFor, poolImpacts });
    }

    // Sort: live first, then upcoming, then recent finals
    const typeOrder = { live: 0, upcoming: 1, final: 2 };
    result.sort((a, b) => typeOrder[a.cardType] - typeOrder[b.cardType]);

    return result;
  }, [games, leverageGames, playerLeverage, player, players, now]);

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map(({ game, cardType, playerDelta, playerRootFor, poolImpacts }) => {
        const isLive = cardType === 'live';
        const isFinal = cardType === 'final';

        return (
          <div
            key={game.slot_index}
            className={`rounded-2xl p-3 border ${
              isLive
                ? 'bg-slate-900/80 border-amber-500/40 shadow-lg shadow-amber-500/5'
                : isFinal
                  ? 'bg-slate-900/40 border-slate-800/40'
                  : 'bg-slate-900/60 border-slate-800/60'
            }`}
          >
            {/* Status indicator */}
            <div className="flex items-center gap-1.5 mb-2">
              {isLive && <LivePing />}
              <span className={`text-[9px] uppercase tracking-wider font-bold ${
                isLive ? 'text-amber-400' : isFinal ? 'text-slate-500' : 'text-slate-600'
              }`} style={{ fontFamily: "Space Mono, monospace" }}>
                {isLive ? (game.gameNote || 'Live') : isFinal ? 'Final' : game.gameTime || 'Soon'}
              </span>
            </div>

            {/* Team 1 */}
            <div className="flex items-center justify-between gap-1">
              <span className={`text-xs font-semibold truncate ${
                isFinal && game.winner === game.team1 ? 'text-white' :
                isFinal ? 'text-slate-500' :
                isLive ? 'text-white' : 'text-slate-300'
              }`}>
                {game.seed1 && <span className="text-slate-500 mr-1">({game.seed1})</span>}
                {game.abbrev1 || shortTeam(game.team1)}
              </span>
              {(isLive || isFinal) && game.score1 != null && (
                <span className={`text-xs font-bold tabular-nums ${
                  isLive ? 'text-amber-400' : 'text-slate-400'
                }`} style={{ fontFamily: "Space Mono, monospace" }}>
                  {game.score1}
                </span>
              )}
            </div>

            {/* Team 2 */}
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <span className={`text-xs font-semibold truncate ${
                isFinal && game.winner === game.team2 ? 'text-white' :
                isFinal ? 'text-slate-500' :
                isLive ? 'text-white' : 'text-slate-300'
              }`}>
                {game.seed2 && <span className="text-slate-500 mr-1">({game.seed2})</span>}
                {game.abbrev2 || shortTeam(game.team2)}
              </span>
              {(isLive || isFinal) && game.score2 != null && (
                <span className={`text-xs font-bold tabular-nums ${
                  isLive ? 'text-amber-400' : 'text-slate-400'
                }`} style={{ fontFamily: "Space Mono, monospace" }}>
                  {game.score2}
                </span>
              )}
            </div>

            {/* Impact section — live/upcoming only */}
            {!isFinal && (playerDelta != null || poolImpacts.length > 0) && (
              <div className="mt-2 pt-2 border-t border-slate-800/40 space-y-1">
                {/* Root for line */}
                {playerDelta != null && playerRootFor && (
                  <div className="text-[10px]">
                    <span className="text-slate-500">Root for </span>
                    <span className="text-orange-400 font-semibold">{shortTeam(playerRootFor)}</span>
                    {' '}
                    <span className="text-emerald-400 font-bold tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                      +{playerDelta.toFixed(1)}%
                    </span>
                  </div>
                )}
                {/* Pool player impacts — top 2 */}
                {poolImpacts.map(pi => (
                  <div key={pi.name} className="text-[10px]">
                    <span className="text-slate-400">{pi.name}</span>
                    {' '}
                    <span className={`font-bold tabular-nums ${pi.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                          style={{ fontFamily: "Space Mono, monospace" }}>
                      {pi.delta >= 0 ? '+' : ''}{pi.delta.toFixed(1)}%
                    </span>
                    {' '}
                    <span className="text-slate-600">w/ {shortTeam(pi.team)} win</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 4. Coming Up ────────────────────────────────────────────────────────────

function ComingUp({ games, leverageGames, playerLeverage, player }) {
  const upcomingGames = useMemo(() => {
    // Build leverage lookup by slot_index
    const leverageBySlot = {};
    for (const lg of (leverageGames || [])) {
      leverageBySlot[lg.id] = lg;
    }
    const playerGames = playerLeverage?.[player?.name] || [];
    for (const pg of playerGames) {
      if (!leverageBySlot[pg.id]) leverageBySlot[pg.id] = pg;
    }

    const now = Date.now();
    const result = [];

    for (const game of games) {
      if (game.status !== 'pending') continue;
      if (!game.team1 || !game.team2 || game.team1 === 'TBD' || game.team2 === 'TBD') continue;

      // Exclude games within 15 minutes of tip (they're in the score grid)
      const tipMs = parseGameTimeToMs(game.gameTime);
      if (tipMs) {
        const minsUntil = (tipMs - now) / 60000;
        if (minsUntil >= 0 && minsUntil <= 15) continue;
      }

      const lg = leverageBySlot[game.slot_index];
      const impact = lg?.playerImpacts?.find(p => p.player === player?.name);
      if (!impact) continue;

      const deltaT1 = impact.ifTeam1 - (player?.winProb ?? 0);
      const deltaT2 = impact.ifTeam2 - (player?.winProb ?? 0);
      const maxAbsDelta = Math.max(Math.abs(deltaT1), Math.abs(deltaT2));

      if (maxAbsDelta < 1) continue; // Skip negligible impact

      result.push({ game, deltaT1, deltaT2, maxAbsDelta });
    }

    result.sort((a, b) => b.maxAbsDelta - a.maxAbsDelta);
    return result.slice(0, 3);
  }, [games, leverageGames, playerLeverage, player]);

  if (upcomingGames.length === 0) return null;

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800/60">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
          Coming Up
        </p>
        <p className="text-[10px] text-slate-600 mt-0.5">Games that matter for your bracket</p>
      </div>
      <div className="divide-y divide-slate-800/40">
        {upcomingGames.map(({ game, deltaT1, deltaT2 }) => (
          <div key={game.slot_index} className="px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300 flex-1 truncate">
                {game.abbrev1 || shortTeam(game.team1)} vs {game.abbrev2 || shortTeam(game.team2)}
              </span>
              {game.gameTime && (
                <span className="text-[10px] text-slate-600 shrink-0" style={{ fontFamily: "Space Mono, monospace" }}>
                  {game.gameTime}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px]">
              <span>
                <span className="text-orange-400 font-semibold">{game.abbrev1 || shortTeam(game.team1)}</span>
                <span className="text-slate-500">: </span>
                <span className={`font-bold tabular-nums ${deltaT1 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      style={{ fontFamily: "Space Mono, monospace" }}>
                  {deltaT1 >= 0 ? '▲+' : '▼'}{deltaT1.toFixed(1)}%
                </span>
              </span>
              <span className="text-slate-700">·</span>
              <span>
                <span className="text-orange-400 font-semibold">{game.abbrev2 || shortTeam(game.team2)}</span>
                <span className="text-slate-500">: </span>
                <span className={`font-bold tabular-nums ${deltaT2 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      style={{ fontFamily: "Space Mono, monospace" }}>
                  {deltaT2 >= 0 ? '▲+' : '▼'}{deltaT2.toFixed(1)}%
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 5. Leaderboard ──────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { key: "points",  label: "Points"  },
  { key: "winProb", label: "Win %"   },
  { key: "ppr",     label: "PPR"     },
]

function Leaderboard({ players, currentPlayer, isLocked, onSelectPlayer }) {
  const [sortBy, setSortBy] = useState("points")
  const prevProbs = useRef({})
  const [flashState, setFlashState] = useState({}) // { playerName: 'up' | 'down' }

  const leaderboard = useMemo(() => {
    return [...players].sort((a, b) => b[sortBy] - a[sortBy])
  }, [players, sortBy])

  // Flash on winProb change
  useEffect(() => {
    const prev = prevProbs.current
    const newFlash = {}
    let changed = false
    for (const p of players) {
      if (prev[p.name] != null && prev[p.name] !== p.winProb) {
        newFlash[p.name] = p.winProb > prev[p.name] ? 'up' : 'down'
        changed = true
      }
    }
    // Update prev
    const next = {}
    for (const p of players) next[p.name] = p.winProb
    prevProbs.current = next

    if (changed) {
      setFlashState(newFlash)
      const timer = setTimeout(() => setFlashState({}), 1500)
      return () => clearTimeout(timer)
    }
  }, [players])

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
          Leaderboard
        </p>
        <div className="flex items-center gap-1">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition-colors ${
                sortBy === opt.key
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-800/40">
        {leaderboard.map(p => {
          const flash = flashState[p.name]
          const flashBg = flash === 'up'
            ? 'bg-emerald-900/20'
            : flash === 'down'
              ? 'bg-red-900/20'
              : ''

          return (
            <button
              key={p.name}
              onClick={() => isLocked && onSelectPlayer(p.name)}
              className={`w-full flex items-center gap-3 px-5 py-3 transition-all duration-500 text-left ${
                flash ? flashBg :
                p.name === currentPlayer?.name ? "bg-orange-500/10" :
                isLocked ? "hover:bg-slate-800/20 cursor-pointer" : "cursor-default"
              }`}
            >
              <span className="text-xs text-slate-600 w-5 text-right tabular-nums shrink-0" style={{ fontFamily: "Space Mono, monospace" }}>
                {p.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold truncate ${p.name === currentPlayer?.name ? "text-orange-400" : "text-white"}`}>
                    {p.name}
                  </span>
                  {p.champAlive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 font-medium shrink-0">♛</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-slate-500" style={{ fontFamily: "Space Mono, monospace" }}>{p.points.toLocaleString()} pts</span>
                  <span className="text-xs text-slate-600">PPR: {p.ppr}</span>
                </div>
              </div>
              <div className="text-right shrink-0 flex items-center gap-1.5">
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{
                    fontFamily: "Space Mono, monospace",
                    color: p.winProb > 15 ? "#34d399" : p.winProb > 8 ? "#fbbf24" : "#94a3b8",
                    transition: "color 0.3s",
                  }}
                >
                  {p.winProb}%
                </span>
                <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(p.winProb * 4, 100)}%`,
                      background: p.winProb > 15 ? "#34d399" : p.winProb > 8 ? "#fbbf24" : "#64748b",
                      transition: "width 0.6s ease, background 0.3s",
                    }}
                  />
                </div>
                <DeltaArrow delta={p.winProbDelta} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    PLAYERS,
    GAMES,
    LEVERAGE_GAMES,
    PLAYER_LEVERAGE,
    BEST_PATH,
    NARRATIVES,
    userPicks,
    simResult,
  } = usePoolData();
  const { pool, members } = usePool();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const isLocked   = pool?.locked === true;
  const isAdmin    = profile?.is_admin === true;
  const hasBracket = userPicks.length > 0 && userPicks.some(p => p != null);
  const ownerName  = members.find(m => m.user_id === pool?.admin_id)?.profiles?.username ?? null;
  const [selectedName, setSelectedName] = useState("");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function handleLeavePool() {
    setLeaving(true);
    const { error } = await supabase
      .from("pool_members")
      .delete()
      .eq("pool_id", pool.id)
      .eq("user_id", profile.id);
    setLeaving(false);
    if (!error) {
      navigate("/join");
    }
  }

  // Default to current user
  useEffect(() => {
    if (profile?.username && PLAYERS.find(p => p.name === profile.username)) {
      setSelectedName(profile.username);
    } else if (PLAYERS.length > 0 && !selectedName) {
      setSelectedName(PLAYERS[0].name);
    }
  }, [profile?.username, PLAYERS]);

  const player = useMemo(() => {
    const name = isLocked ? selectedName : (profile?.username ?? selectedName);
    return PLAYERS.find(p => p.name === name) ?? PLAYERS[0] ?? null;
  }, [selectedName, PLAYERS, isLocked, profile?.username]);

  // Gate: non-admins see the holding screen until the pool is locked
  if (!isLocked && !isAdmin) {
    return (
      <PreGameScreen
        pool={pool}
        playerCount={PLAYERS.length}
        hasBracket={hasBracket}
        ownerName={ownerName}
        onLeavePool={() => setShowLeaveConfirm(true)}
      />
    );
  }

  if (!player) return null;

  function copyInviteLink() {
    const url = `${window.location.origin}/join?code=${pool?.invite_code}`;
    navigator.clipboard.writeText(url);
  }

  const poolNarrative   = NARRATIVES['_pool'] ?? null;
  const playerNarrative = NARRATIVES[player.name] ?? null;
  const bestPath        = BEST_PATH?.[player.name] ?? BEST_PATH?.['_default'] ?? [];
  const hasLiveGames    = GAMES.some(g => g.status === 'live');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

      {/* ── Pool Header ────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-3 flex items-center gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white truncate">{pool?.name ?? "Pool"}</h2>
            <span className="text-xs text-slate-500 shrink-0">
              {PLAYERS.length} {PLAYERS.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          {ownerName && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Commissioner: <span className="text-slate-400">{ownerName}</span>
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0 flex-wrap">
          {isLocked ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Viewing:</span>
              <select
                value={selectedName}
                onChange={e => setSelectedName(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {PLAYERS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              Viewing: <span className="text-white font-semibold">{profile?.username}</span>
            </span>
          )}
          {!isLocked && pool?.invite_code && (
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold hover:bg-orange-500/20 transition-all"
            >
              Invite Friends
            </button>
          )}
          {!isAdmin && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-500 hover:text-red-400 hover:border-red-900/40 text-xs font-semibold transition-all"
            >
              Leave Pool
            </button>
          )}
        </div>
      </div>

      {/* ── 1. Stat Bar ──────────────────────────────────────────────────────── */}
      <StatBar player={player} poolSize={PLAYERS.length} bestPath={bestPath} />

      {/* ── 2. Narrative ─────────────────────────────────────────────────────── */}
      <NarrativeCard
        poolNarrative={poolNarrative}
        playerNarrative={playerNarrative}
        hasLiveGames={hasLiveGames}
      />

      {/* ── 3. Score Grid ────────────────────────────────────────────────────── */}
      <ScoreGrid
        games={GAMES}
        leverageGames={LEVERAGE_GAMES}
        playerLeverage={PLAYER_LEVERAGE}
        player={player}
        players={PLAYERS}
      />

      {/* ── 4. Coming Up ─────────────────────────────────────────────────────── */}
      <ComingUp
        games={GAMES}
        leverageGames={LEVERAGE_GAMES}
        playerLeverage={PLAYER_LEVERAGE}
        player={player}
      />

      {/* ── 5. Leaderboard ───────────────────────────────────────────────────── */}
      <Leaderboard
        players={PLAYERS}
        currentPlayer={player}
        isLocked={isLocked}
        onSelectPlayer={setSelectedName}
      />

      {/* Leave pool confirm modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <p className="text-sm font-bold text-white mb-2">Leave this pool?</p>
            <p className="text-xs text-slate-400 mb-1">
              You'll be removed from <span className="text-white font-semibold">{pool?.name}</span> and your bracket will be deleted.
            </p>
            <p className="text-xs text-red-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                disabled={leaving}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLeavePool}
                disabled={leaving}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {leaving ? "Leaving…" : "Yes, Leave Pool"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

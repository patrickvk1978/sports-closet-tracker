import { useState, useMemo, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { useNarrativeFeed } from "../hooks/useNarrativeFeed";
import { supabase } from "../lib/supabase";
import {
  getFinishMetricColor,
  getFinishMetricDelta,
  getFinishMetricOptions,
  getPrizePlacesFromPool,
  getFinishMetricValue,
} from "../lib/finishProbabilities";
import { SLOT_ROUND } from "../lib/scoring";
import LiveFeed from "../components/LiveFeed";

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
  return name;
}

const ROUND_MODE_ORDER = ["R64", "R32", "S16", "E8", "F4", "Champ"];
const ROUND_MODE_LABELS = {
  R64: "R64",
  R32: "R32",
  S16: "S16",
  E8: "E8",
  F4: "F4",
  Champ: "Champ",
};

function getVisibleRoundKeys(pool, games) {
  const startRound = pool?.start_round ?? "R64";
  const startIndex = Math.max(0, ROUND_MODE_ORDER.indexOf(startRound));
  const scoringConfig = pool?.scoring_config ?? {};

  return ROUND_MODE_ORDER.slice(startIndex).filter((roundKey) => {
    const configuredValue = Number(scoringConfig?.[roundKey] ?? 0);
    if (configuredValue > 0) return true;
    return games.some((game) => SLOT_ROUND[game.slot_index] === roundKey);
  });
}

function buildRoundPointsByPlayer(players, games, roundPoints) {
  return players.reduce((acc, player) => {
    const totals = ROUND_MODE_ORDER.reduce((roundAcc, roundKey) => {
      roundAcc[roundKey] = 0;
      return roundAcc;
    }, {});

    games.forEach((game) => {
      const roundKey = SLOT_ROUND[game.slot_index];
      if (!roundKey || !game.winner) return;
      if (player.picks?.[game.slot_index] !== game.winner) return;
      totals[roundKey] += Number(roundPoints?.[roundKey] ?? 0);
    });

    acc[player.name] = totals;
    return acc;
  }, {});
}

function FinishMetricPicker({ options, value, onChange, compact = false }) {
  if (!options?.length || options.length <= 1) return null;

  return (
    <div className={`flex items-center gap-1 ${compact ? "flex-wrap" : "flex-wrap"}`}>
      {options.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
            value === option.key
              ? "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30"
              : "bg-slate-800/50 text-slate-500 hover:text-slate-300"
          }`}
        >
          {compact ? option.shortLabel : option.label}
        </button>
      ))}
    </div>
  );
}

// ─── 1. Stat Bar ─────────────────────────────────────────────────────────────

function StatBar({ player, poolSize, bestPath, finishMetric, finishMetricOptions, onFinishMetricChange, isAdmin }) {
  if (!player) return null;
  const finishValue = getFinishMetricValue(player, finishMetric);
  const finishDelta = getFinishMetricDelta(player, finishMetric);
  const finishLabel = finishMetricOptions.find((option) => option.key === finishMetric)?.label ?? "Win %";
  const finishColor = getFinishMetricColor(finishMetric, finishValue);

  // Compress best path into "Need: X, Y, Z"
  const needs = (bestPath || [])
    .slice(0, 3)
    .map(b => b.text.replace(/ wins the championship$/i, ' champ')
                     .replace(/ reaches the Final Four$/i, ' F4')
                     .replace(/ wins the (Midwest|West|South|East)$/i, (_, r) => ` ${r.slice(0, 2).toUpperCase()}`))

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-3">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500" style={{ fontFamily: "Space Mono, monospace" }}>
          Standings Lens
        </span>
        <FinishMetricPicker
          options={finishMetricOptions}
          value={finishMetric}
          onChange={onFinishMetricChange}
        />
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {/* Rank */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-2xl font-bold text-white tabular-nums leading-none" style={{ fontFamily: "Space Mono, monospace" }}>
            #{player.rank}
          </span>
          <span className="text-[10px] text-slate-500">of {poolSize}</span>
        </div>

        <div className="w-px h-6 bg-slate-700/60 shrink-0 hidden sm:block" />

        {/* Points + Selected finish probability */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-white tabular-nums leading-none" style={{ fontFamily: "Space Mono, monospace" }}>
              {player.points.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-500">pts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{finishLabel}</span>
            <span className="text-lg font-bold tabular-nums leading-none" style={{ fontFamily: "Space Mono, monospace", color: finishColor }}>
              {finishValue.toFixed(1)}%
            </span>
            <DeltaArrow delta={finishDelta} />
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

        {/* Needs / Biography link */}
        {isAdmin ? (
          <>
            <div className="w-px h-6 bg-slate-700/60 shrink-0 hidden sm:block" />
            <Link
              to={`/reports/biography/${encodeURIComponent(player.name)}`}
              className="text-[11px] text-orange-300/80 hover:text-orange-300 transition-colors"
            >
              Post-Game Report →
            </Link>
          </>
        ) : needs.length > 0 && (
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
                isLive ? 'text-amber-400' : isFinal ? 'text-slate-500' : 'text-slate-400'
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
                    <span className="text-slate-400">w/ {shortTeam(pi.team)} win</span>
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
        <p className="text-[10px] text-slate-400 mt-0.5">Games that matter for your bracket</p>
      </div>
      <div className="divide-y divide-slate-800/40">
        {upcomingGames.map(({ game, deltaT1, deltaT2 }) => (
          <div key={game.slot_index} className="px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300 flex-1 truncate">
                {game.abbrev1 || shortTeam(game.team1)} vs {game.abbrev2 || shortTeam(game.team2)}
              </span>
              {game.gameTime && (
                <span className="text-[10px] text-slate-400 shrink-0" style={{ fontFamily: "Space Mono, monospace" }}>
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

function getSortValue(player, key, roundPointsByPlayer) {
  if (key === "points") return player.points
  if (key === "rank") return player.rank
  if (ROUND_MODE_ORDER.includes(key)) return roundPointsByPlayer[player.name]?.[key] ?? 0
  return getFinishMetricValue(player, key)
}

function Leaderboard({ players, currentPlayer, isLocked, onSelectPlayer, finishMetricOptions, games, pool }) {
  const [sortBy, setSortBy] = useState("points")
  const [sortDir, setSortDir] = useState("desc")
  const [viewMode, setViewMode] = useState("summary")
  const visibleMetricOptions = viewMode === "summary" ? finishMetricOptions : finishMetricOptions
  const roundColumns = useMemo(() => getVisibleRoundKeys(pool, games), [pool, games])
  const roundPointsByPlayer = useMemo(
    () => buildRoundPointsByPlayer(players, games, pool?.scoring_config ?? {}),
    [players, games, pool?.scoring_config]
  )

  function toggleSort(nextKey) {
    if (sortBy === nextKey) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"))
      return
    }
    setSortBy(nextKey)
    setSortDir("desc")
  }

  const leaderboard = useMemo(() => {
    const direction = sortDir === "desc" ? -1 : 1
    return [...players].sort((a, b) => {
      const diff = getSortValue(a, sortBy, roundPointsByPlayer) - getSortValue(b, sortBy, roundPointsByPlayer)

      if (diff !== 0) return diff * direction
      return a.name.localeCompare(b.name)
    })
  }, [players, sortBy, sortDir, roundPointsByPlayer])

  const leaderboardWithDisplayRank = useMemo(() => {
    let currentRank = 1

    return leaderboard.map((player, index) => {
      if (index > 0) {
        const previousPlayer = leaderboard[index - 1]
        if (getSortValue(player, sortBy, roundPointsByPlayer) !== getSortValue(previousPlayer, sortBy, roundPointsByPlayer)) {
          currentRank = index + 1
        }
      }

      return {
        ...player,
        displayRank: currentRank,
      }
    })
  }, [leaderboard, sortBy, roundPointsByPlayer])

  function SortableHeader({ sortKey, label, className = "", align = "right" }) {
    const active = sortBy === sortKey
    const arrow = active ? (sortDir === "desc" ? "▼" : "▲") : ""
    return (
      <th
        onClick={() => toggleSort(sortKey)}
        className={`px-2 sm:px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"} cursor-pointer select-none hover:text-slate-300 whitespace-nowrap ${className}`}
        style={{ fontFamily: "Space Mono, monospace" }}
      >
        <span className="inline-flex items-center gap-1">
          <span>{label}</span>
          <span className={`${active ? "text-orange-400" : "text-slate-700"}`}>{arrow || "↕"}</span>
        </span>
      </th>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/60">
      <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
          Leaderboard
        </p>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1 rounded-lg bg-slate-950/60 p-1">
            {[
              { key: "summary", label: "Summary" },
              { key: "detailed", label: "Detailed" },
              { key: "byRound", label: "By Round" },
            ].map((mode) => (
              <button
                key={mode.key}
                onClick={() => setViewMode(mode.key)}
                className={`text-[10px] px-2 py-1 rounded-md font-semibold transition-colors ${
                  viewMode === mode.key
                    ? "bg-slate-700 text-white"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500" style={{ fontFamily: "Space Mono, monospace" }}>
            Click a column header to sort
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse md:min-w-0">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/80 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
              <th className="px-2 sm:px-4 py-2.5 w-8 sm:w-10">#</th>
              <th className="px-2 sm:px-4 py-2.5">Entry</th>
              <SortableHeader sortKey="points" label="Pts" />
              {viewMode === "byRound"
                ? roundColumns.map((roundKey) => (
                    <SortableHeader
                      key={roundKey}
                      sortKey={roundKey}
                      label={ROUND_MODE_LABELS[roundKey] ?? roundKey}
                    />
                  ))
                : visibleMetricOptions.map((option) => (
                    <SortableHeader
                      key={option.key}
                      sortKey={option.key}
                      label={option.label}
                    />
                  ))}
              <th className="px-2 sm:px-4 py-2.5 text-center w-10 sm:w-auto"></th>
            </tr>
          </thead>
          <tbody>
            {leaderboardWithDisplayRank.map(p => {
              const isActive = p.name === currentPlayer?.name
              return (
                <tr
                  key={p.name}
                  onClick={() => isLocked && onSelectPlayer(p.name)}
                  className={`border-b border-slate-800/60 last:border-b-0 transition-colors ${
                    isActive ? 'bg-orange-500/10' :
                    isLocked ? 'hover:bg-slate-800/20 cursor-pointer' : ''
                  }`}
                >
                  <td className="px-2 sm:px-4 py-2 text-sm font-semibold text-slate-500 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                    {p.displayRank}
                  </td>
                  <td className="px-2 sm:px-4 py-2">
                    <span className={`text-sm font-semibold ${isActive ? 'text-orange-400' : 'text-white'}`}>
                      {p.name}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right text-sm font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                    {p.points.toLocaleString()}
                  </td>
                  {viewMode === "byRound"
                    ? roundColumns.map((roundKey) => (
                        <td key={roundKey} className="px-2 sm:px-4 py-2 text-right whitespace-nowrap">
                          <span
                            className="text-sm font-bold text-white tabular-nums"
                            style={{ fontFamily: "Space Mono, monospace" }}
                          >
                            {(roundPointsByPlayer[p.name]?.[roundKey] ?? 0).toLocaleString()}
                          </span>
                        </td>
                      ))
                    : visibleMetricOptions.map((option) => {
                        const finishValue = getFinishMetricValue(p, option.key)
                        const finishDelta = getFinishMetricDelta(p, option.key)
                        return (
                          <td key={option.key} className="px-2 sm:px-4 py-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <span
                                className="text-sm font-bold tabular-nums"
                                style={{ fontFamily: "Space Mono, monospace", color: getFinishMetricColor(option.key, finishValue) }}
                              >
                                {finishValue.toFixed(1)}%
                              </span>
                              {viewMode === "detailed" && <DeltaArrow delta={finishDelta} />}
                            </div>
                          </td>
                        )
                      })}
                  <td className="px-2 sm:px-4 py-2 text-center">
                    <span
                      className={`inline-flex rounded-full border px-1.5 sm:px-2 py-0.5 text-[10px] font-semibold ${
                        p.champAlive
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : 'border-red-500/20 bg-red-500/10 text-red-400'
                      }`}
                    >
                      <span className="sm:hidden">{p.champAlive ? '♛' : '✗'}</span>
                      <span className="hidden sm:inline">{p.champAlive ? '♛ alive' : '♛ out'}</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 6. Between-Rounds Screen ───────────────────────────────────────────────

function BetweenRoundsScreen({ pool, players, ownerName, tipoff, finishMetricOptions, games }) {
  const tipoffDate = new Date(tipoff);
  const { days, hours, mins, secs, done } = useCountdown(tipoffDate.getTime());

  const dayLabel = tipoffDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const timeLabel = tipoffDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Pool header */}
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
          {players.length} {players.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Countdown */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-10 flex flex-col items-center text-center gap-6">
        <div className="space-y-2">
          <div className="text-4xl">🏀</div>
          <h1 className="text-2xl font-bold text-white">Next Round Tips Off Soon</h1>
          <p className="text-sm text-slate-400">
            The dashboard will return when games resume. Check the standings below.
          </p>
        </div>

        {done ? (
          <p className="text-orange-400 font-semibold">Games are underway — refreshing shortly!</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-slate-500">{dayLabel} · {timeLabel}</p>
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
      </div>

      {/* Leaderboard */}
      <Leaderboard
        players={players}
        currentPlayer={null}
        isLocked={false}
        onSelectPlayer={() => {}}
        finishMetricOptions={finishMetricOptions}
        games={games}
        pool={pool}
      />
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
  const { entries: feedEntries, loading: feedLoading } = useNarrativeFeed(pool?.id);

  const isLocked   = pool?.locked === true;
  const isAdmin    = profile?.is_admin === true;
  const hasBracket = userPicks.length > 0 && userPicks.some(p => p != null);
  const ownerName  = members.find(m => m.user_id === pool?.admin_id)?.profiles?.username ?? null;
  const [selectedName, setSelectedName] = useState("");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const prizePlaces = useMemo(() => getPrizePlacesFromPool(pool), [pool]);
  const finishMetricOptions = useMemo(() => getFinishMetricOptions(PLAYERS, prizePlaces), [PLAYERS, prizePlaces]);
  const [finishMetric, setFinishMetric] = useState("winProb");

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

  // Set default player once: current user if found, else first player.
  // Intentionally excludes PLAYERS from deps — PLAYERS referential changes
  // on every poll cycle and must not reset a user's manual selection.
  useEffect(() => {
    if (selectedName) return;  // user already chose someone
    if (profile?.username && PLAYERS.find(p => p.name === profile.username)) {
      setSelectedName(profile.username);
    } else if (PLAYERS.length > 0) {
      setSelectedName(PLAYERS[0].name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.username]);

  const player = useMemo(() => {
    const name = isLocked ? selectedName : (profile?.username ?? selectedName);
    return PLAYERS.find(p => p.name === name) ?? PLAYERS[0] ?? null;
  }, [selectedName, PLAYERS, isLocked, profile?.username]);

  useEffect(() => {
    if (!finishMetricOptions.some((option) => option.key === finishMetric)) {
      setFinishMetric(finishMetricOptions[0]?.key ?? "winProb");
    }
  }, [finishMetric, finishMetricOptions]);

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

  // Gate: between rounds — admin sets next_tipoff, non-admins see countdown + leaderboard
  const betweenRounds = pool?.next_tipoff && new Date(pool.next_tipoff) > new Date();
  if (isLocked && betweenRounds && !isAdmin) {
    return (
      <BetweenRoundsScreen
        pool={pool}
        players={PLAYERS}
        ownerName={ownerName}
        tipoff={pool.next_tipoff}
        finishMetricOptions={finishMetricOptions}
        games={GAMES}
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

  const selectedFinishValue = player ? getFinishMetricValue(player, finishMetric) : 0;
  const selectedFinishDelta = player ? getFinishMetricDelta(player, finishMetric) : null;
  const selectedFinishLabel = finishMetricOptions.find((option) => option.key === finishMetric)?.shortLabel ?? "Win %";
  const selectedFinishColor = getFinishMetricColor(finishMetric, selectedFinishValue);

  return (
    <>
    {/* ── Mobile sticky hero bar ───────────────────────────────────────────── */}
    {player && (
      <div className="sm:hidden sticky top-[52px] z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/60 px-4 py-2 flex items-center gap-2.5">
        {isLocked ? (
          <select
            value={selectedName}
            onChange={e => setSelectedName(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500 max-w-[110px]"
          >
            {PLAYERS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        ) : (
          <span className="text-xs font-semibold text-white truncate max-w-[110px]">{profile?.username}</span>
        )}
        <span className="text-slate-700">·</span>
        <span className="text-sm font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
          #{player.rank}
        </span>
        <span className="text-[10px] text-slate-500">of {PLAYERS.length}</span>
        <span className="text-slate-700">·</span>
        <span className="text-sm font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
          {player.points.toLocaleString()}
        </span>
        <span className="text-[10px] text-slate-500">pts</span>
        <span className="text-slate-700">·</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{selectedFinishLabel}</span>
        <span className="text-sm font-bold tabular-nums" style={{ fontFamily: "Space Mono, monospace", color: selectedFinishColor }}>
          {selectedFinishValue.toFixed(1)}%
        </span>
        <DeltaArrow delta={selectedFinishDelta} />
      </div>
    )}

    <div className="max-w-7xl mx-auto px-4 py-2 sm:py-6 space-y-2 sm:space-y-4">

      {/* ── Pool Header — desktop only ──────────────────────────────────────── */}
      <div className="hidden sm:flex bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-3 items-center gap-4 flex-wrap">
        <div className="min-w-0 hidden sm:block">
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
        <div className="sm:ml-auto flex items-center gap-3 shrink-0 flex-wrap">
          {isLocked ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 hidden sm:inline">Viewing:</span>
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

      {/* ── 1. Stat Bar — desktop only (mobile uses sticky hero bar above) ──── */}
      <div className="hidden sm:block">
        <StatBar
          player={player}
          poolSize={PLAYERS.length}
          bestPath={bestPath}
          finishMetric={finishMetric}
          finishMetricOptions={finishMetricOptions}
          onFinishMetricChange={setFinishMetric}
          isAdmin={isAdmin}
        />
      </div>

      {/* ── 2. Live Feed / Narrative ────────────────────────────────────────── */}
      {feedEntries.length > 0 || feedLoading ? (
        <LiveFeed
          entries={feedEntries}
          playerName={player.name}
          loading={feedLoading}
        />
      ) : (
        <NarrativeCard
          poolNarrative={poolNarrative}
          playerNarrative={playerNarrative}
          hasLiveGames={hasLiveGames}
        />
      )}

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
        finishMetricOptions={finishMetricOptions}
        games={GAMES}
        pool={pool}
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

    {/* Admin backdoor — floating pill, mobile only, bottom-right */}
    {profile?.is_admin && (
      <NavLink
        to="/admin"
        className="sm:hidden fixed bottom-5 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700/60 text-cyan-500/70 text-[11px] font-semibold shadow-lg backdrop-blur-sm"
      >
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.971.342 1.406.594l1.259-.751a1 1 0 011.23.153l.962.962a1 1 0 01.153 1.23l-.75 1.259c.251.435.45.909.594 1.406l1.473.295a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.594 1.406l.75 1.259a1 1 0 01-.153 1.23l-.962.962a1 1 0 01-1.23.153l-1.259-.75a6.957 6.957 0 01-1.406.594l-.295 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.957 6.957 0 01-1.406-.594l-1.259.75a1 1 0 01-1.23-.153l-.962-.962a1 1 0 01-.153-1.23l.75-1.259a6.95 6.95 0 01-.594-1.406L1.804 10.3A1 1 0 011 9.32V7.96a1 1 0 01.804-.98l1.473-.295a6.95 6.95 0 01.594-1.406l-.75-1.259a1 1 0 01.153-1.23l.962-.962a1 1 0 011.23-.153l1.259.75a6.95 6.95 0 011.406-.594l.295-1.473zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
        Admin
      </NavLink>
    )}
    </>
  );
}

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

// ─── Stat Strip ─────────────────────────────────────────────────────────────

function StatStrip({ player, poolSize }) {
  if (!player) return null;
  const winProbColor = player.winProb > 15 ? "text-emerald-400" : player.winProb > 8 ? "text-amber-400" : "text-slate-400";

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Rank */}
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="text-3xl font-bold text-white tabular-nums leading-none" style={{ fontFamily: "Space Mono, monospace" }}>
            #{player.rank}
          </span>
          <span className="text-xs text-slate-500">of {poolSize}</span>
        </div>

        <div className="w-px h-8 bg-slate-700/60 shrink-0 hidden sm:block" />

        {/* Stats row */}
        <div className="flex items-center gap-5 flex-wrap">
          <div>
            <div className="text-lg font-bold text-white tabular-nums leading-none" style={{ fontFamily: "Space Mono, monospace" }}>
              {player.points.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Points</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-300 tabular-nums leading-none" style={{ fontFamily: "Space Mono, monospace" }}>
              {player.ppr.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Possible</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`text-lg font-bold tabular-nums leading-none ${winProbColor}`} style={{ fontFamily: "Space Mono, monospace" }}>
                {player.winProb}%
              </span>
              <DeltaArrow delta={player.winProbDelta} />
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Win Prob</div>
          </div>
        </div>

        <div className="w-px h-8 bg-slate-700/60 shrink-0 hidden sm:block" />

        {/* Status pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {player.champAlive ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-900/40 text-emerald-400 font-semibold border border-emerald-800/40">
              ♛ Champion Alive
            </span>
          ) : (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-900/30 text-red-400 font-semibold border border-red-800/30">
              Champion Eliminated
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Status Lines ───────────────────────────────────────────────────────────

function formatAgo(ms) {
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`;
}

function UpdateStatusLine({ simResult }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!simResult?.run_at) return null;
  const runAt = new Date(simResult.run_at).getTime();
  const elapsed = now - runAt;
  const agoText = formatAgo(elapsed);
  // Next narrative assumed ~2h cadence
  const nextMs = Math.max(0, 7_200_000 - elapsed);
  const nextH = Math.floor(nextMs / 3_600_000);
  const nextM = Math.floor((nextMs % 3_600_000) / 60_000);
  const nextText = nextMs === 0 ? 'soon' : nextH > 0 ? `~${nextH}h ${nextM}m` : `~${nextM}m`;

  return (
    <p className="text-[10px] text-slate-500" style={{ fontFamily: "Space Mono, monospace" }}>
      Updated {agoText} · Refreshes in {nextText}
    </p>
  );
}

function GameStatusLine({ games }) {
  if (!games || games.length === 0) return null;

  const finalGames = games.filter(g => g.status === 'final' && g.updated_at);
  const liveGames = games.filter(g => g.status === 'live');

  const lastFinal = finalGames.length > 0
    ? finalGames.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]
    : null;

  if (!lastFinal && liveGames.length === 0) return null;

  return (
    <p className="text-[10px] text-slate-500" style={{ fontFamily: "Space Mono, monospace" }}>
      {lastFinal && (
        <span>Last sim after {lastFinal.matchup}</span>
      )}
      {lastFinal && liveGames.length > 0 && <span> · </span>}
      {liveGames.length > 0 ? (
        <span>Next: when {liveGames[0].matchup} ends</span>
      ) : finalGames.length === games.filter(g => g.team1).length ? (
        <span> · All games complete</span>
      ) : null}
    </p>
  );
}

// ─── Narrative Cards ─────────────────────────────────────────────────────────

function PoolNarrativeCard({ narrative, simResult }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!narrative) return null;
  const agoText = simResult?.run_at ? formatAgo(now - new Date(simResult.run_at).getTime()) : null;

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-4">
      <p className="text-sm text-slate-200 leading-relaxed">{narrative}</p>
      <p className="text-[10px] text-slate-600 mt-1.5 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
        Today's Briefing{agoText ? ` · Updated ${agoText}` : ''}
      </p>
    </div>
  );
}

function PlayerNarrativeCard({ narrative }) {
  if (!narrative) return null;
  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-4">
      <p className="text-sm text-slate-300 leading-relaxed">{narrative}</p>
      <p className="text-[10px] text-slate-600 mt-1.5 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
        Your Situation
      </p>
    </div>
  );
}

// ─── Pool Key Games Card ────────────────────────────────────────────────────

function PoolKeyGamesCard({ leverageGames, players }) {
  const topGames = useMemo(() => {
    return [...leverageGames]
      .filter(g => g.team1 !== "TBD" && g.team2 !== "TBD")
      .sort((a, b) => {
        if (a.status === "live" && b.status !== "live") return -1
        if (b.status === "live" && a.status !== "live") return 1
        return b.leverage - a.leverage
      })
      .slice(0, 3)
  }, [leverageGames])

  if (topGames.length === 0) return null

  // Pick split helper
  const pickSplit = (game) => {
    if (!players?.length || !game.team1) return null
    const t1Picks = players.filter(p => p.picks?.[game.slot_index ?? game.id] === game.team1).length
    const pct = Math.round((t1Picks / players.length) * 100)
    const shortName = game.team1.split(' ').pop()
    return { pct, shortName }
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800/60">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
          Pool's Key Games
        </p>
        <p className="text-[10px] text-slate-600 mt-0.5">Games that most affect who wins the pool</p>
      </div>
      <div className="divide-y divide-slate-800/40">
        {topGames.map(game => {
          const top2 = (game.playerImpacts ?? [])
            .map(imp => ({
              player: imp.player,
              swing: Math.abs(imp.ifTeam1 - imp.ifTeam2),
              rootFor: imp.ifTeam1 >= imp.ifTeam2 ? game.team1 : game.team2,
            }))
            .sort((a, b) => b.swing - a.swing)
            .slice(0, 2)
          const split = pickSplit(game)

          return (
            <div key={game.id} className="px-5 py-3">
              <div className="flex items-center gap-3">
                {game.status === "live" && <LivePing />}
                <span className={`text-sm flex-1 ${game.status === "live" ? "text-white" : "text-slate-300"}`}>
                  {game.team1} vs {game.team2}
                </span>
                {game.status === "live" && game.score1 != null && (
                  <span className="text-xs font-bold text-amber-400 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                    {game.score1}–{game.score2}
                  </span>
                )}
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                  game.leverage >= 60 ? "bg-red-500/20 text-red-400" :
                  game.leverage >= 35 ? "bg-amber-500/20 text-amber-400" :
                                        "bg-slate-700/60 text-slate-400"
                }`} style={{ fontFamily: "Space Mono, monospace" }}>
                  ↕ {game.leverage}% swing
                </span>
              </div>
              {/* Player impacts + pick split */}
              <div className="flex items-center gap-3 mt-1">
                {top2.map(imp => (
                  <span key={imp.player} className="text-[9px] text-slate-500">
                    {imp.player} <span className="text-orange-400">{imp.rootFor.split(' ').pop()}</span> <span className="text-emerald-400">▲+{imp.swing.toFixed(1)}%</span>
                  </span>
                ))}
                {split && (
                  <span className="text-[9px] text-slate-600 ml-auto">
                    {split.pct}% on {split.shortName}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Your Key Games Card ────────────────────────────────────────────────────

function YourKeyGamesCard({ player, playerLeverageGames, leverageGames }) {
  const keyGames = useMemo(() => {
    // Prefer server-computed per-player ranking from simulate.py
    if (playerLeverageGames?.length > 0) return playerLeverageGames.slice(0, 3)

    // Fallback: sort pool-wide games by this player's personal swing
    return [...leverageGames]
      .filter(g => g.team1 !== "TBD" && g.team2 !== "TBD")
      .map(g => {
        const impact = g.playerImpacts?.find(p => p.player === player?.name)
        return { g, swing: impact ? Math.abs(impact.ifTeam1 - impact.ifTeam2) : 0 }
      })
      .sort((a, b) => {
        if (a.g.status === "live" && b.g.status !== "live") return -1
        if (b.g.status === "live" && a.g.status !== "live") return 1
        return b.swing - a.swing
      })
      .slice(0, 3)
      .map(({ g }) => g)
  }, [playerLeverageGames, leverageGames, player])

  if (keyGames.length === 0) return null

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800/60">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
          Your Key Games
        </p>
        <p className="text-[10px] text-slate-600 mt-0.5">Games that most affect your chances</p>
      </div>
      <div className="divide-y divide-slate-800/40">
        {keyGames.map(game => {
          const impact = game.playerImpacts?.find(p => p.player === player?.name)
          const rootFor = impact ? (impact.ifTeam1 >= impact.ifTeam2 ? game.team1 : game.team2) : null
          const gain = impact
            ? Math.max(impact.ifTeam1, impact.ifTeam2) - Math.min(impact.ifTeam1, impact.ifTeam2)
            : null

          return (
            <div key={game.id} className="px-5 py-3 flex items-center gap-3">
              {game.status === "live" && <LivePing />}
              <span className={`text-sm flex-1 min-w-0 truncate ${game.status === "live" ? "text-white" : "text-slate-300"}`}>
                {game.team1} vs {game.team2}
              </span>
              {game.status === "live" && game.score1 != null && (
                <span className="text-xs font-bold text-amber-400 tabular-nums shrink-0" style={{ fontFamily: "Space Mono, monospace" }}>
                  {game.score1}–{game.score2}
                </span>
              )}
              {rootFor && gain != null ? (
                <span className="text-xs shrink-0 flex items-center gap-1">
                  <span className="text-slate-500">Root for</span>
                  <span className="font-bold text-orange-400">{rootFor}</span>
                  <span className="text-emerald-400 font-bold tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                    ▲ +{gain.toFixed(1)}%
                  </span>
                </span>
              ) : (
                <span className="text-[10px] text-slate-600 shrink-0">—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

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
  const [copied, setCopied] = useState(false);
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const poolNarrative   = NARRATIVES['_pool'] ?? null;
  const playerNarrative = NARRATIVES[player.name] ?? null;

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
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
              </svg>
              {copied ? "Copied!" : "Invite Friends"}
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

      {/* ── Status Lines ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5 px-1">
        <UpdateStatusLine simResult={simResult} />
        <GameStatusLine games={GAMES} />
      </div>

      {/* ── Pool Briefing ──────────────────────────────────────────────────── */}
      <PoolNarrativeCard narrative={poolNarrative} simResult={simResult} />

      {/* ── Stat Strip ─────────────────────────────────────────────────────── */}
      <StatStrip player={player} poolSize={PLAYERS.length} />

      {/* ── Player Narrative ───────────────────────────────────────────────── */}
      <PlayerNarrativeCard narrative={playerNarrative} />

      {/* ── Pool Key Games ─────────────────────────────────────────────────── */}
      <PoolKeyGamesCard leverageGames={LEVERAGE_GAMES} players={PLAYERS} />

      {/* ── Your Key Games ─────────────────────────────────────────────────── */}
      <YourKeyGamesCard
        player={player}
        playerLeverageGames={PLAYER_LEVERAGE[player?.name] ?? []}
        leverageGames={LEVERAGE_GAMES}
      />

      {/* ── Leaderboard ────────────────────────────────────────────────────── */}
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

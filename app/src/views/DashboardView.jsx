import { useState, useMemo, useEffect } from "react";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeStatusMessage(player) {
  if (!player) return null;
  const { winProb, rank } = player;
  if (winProb > 40) return { text: "Strong position. Defend your lead and let the bracket play out.", sentiment: "good" };
  if (winProb > 20) return { text: "In the mix. A few key results this weekend could make your bracket shine.", sentiment: "good" };
  if (winProb > 10) return { text: "In striking distance. You likely need 2–3 key breaks this weekend.", sentiment: "neutral" };
  if (winProb > 5)  return { text: "Needs help. Still alive but counting on upsets and some luck.", sentiment: "neutral" };
  return { text: "Long shot. You need multiple upsets and a collapse from the leaders.", sentiment: "danger" };
}

function LivePing() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
    </span>
  );
}

// ─── Stat Strip ─────────────────────────────────────────────────────────────

function StatStrip({ player, poolSize }) {
  if (!player) return null;
  const maxPossible = player.points + player.ppr;
  const winProbColor = player.winProb > 15 ? "text-emerald-400" : player.winProb > 8 ? "text-amber-400" : "text-slate-400";

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Rank — largest element */}
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
            <div className={`text-lg font-bold tabular-nums leading-none ${winProbColor}`} style={{ fontFamily: "Space Mono, monospace" }}>
              {player.winProb}%
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

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ player, players, bestPath, isLocked, onSelectPlayer }) {
  const status = computeStatusMessage(player);
  const leaderboard = useMemo(() => [...players].sort((a, b) => a.rank - b.rank), [players]);

  const closestRival = useMemo(() => {
    return players
      .filter(p => p.name !== player.name)
      .reduce((best, rival) => {
        const matches = player.picks.reduce((acc, pick, i) => pick === rival.picks[i] ? acc + 1 : acc, 0);
        return !best || matches > best.matches ? { ...rival, matches, divergences: player.picks.length - matches } : best;
      }, null);
  }, [player, players]);

  const myPath = bestPath[player.name] ?? bestPath._default ?? [];

  return (
    <div className="space-y-5">
      {/* Status message */}
      {status && (
        <div className={`rounded-2xl px-5 py-4 border ${
          status.sentiment === "good"    ? "bg-emerald-950/40 border-emerald-800/30" :
          status.sentiment === "danger"  ? "bg-red-950/40 border-red-800/30" :
                                           "bg-slate-900/60 border-slate-800/60"
        }`}>
          <p className="text-sm font-medium text-slate-200 leading-relaxed">{status.text}</p>
          <p className="text-[10px] text-slate-600 mt-1.5 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
            Based on current standings · Win probability engine coming soon
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Best path to win */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
              Best Path to Win
            </p>
            <span className="text-[9px] text-slate-600 bg-slate-800/60 px-2 py-0.5 rounded-full">Phase 3 preview</span>
          </div>
          <div className="p-5 space-y-2.5">
            {myPath.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${item.type === "good" ? "bg-emerald-400" : "bg-slate-500"}`} />
                <span className="text-sm text-slate-300">{item.text}</span>
              </div>
            ))}
            {myPath.length === 0 && (
              <p className="text-sm text-slate-500">Path calculation available after Phase 3 launch.</p>
            )}
          </div>
        </div>

        {/* Biggest rival */}
        {closestRival && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800/60">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
                Biggest Rival
              </p>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <button
                    onClick={() => isLocked && onSelectPlayer(closestRival.name)}
                    className={`text-base font-bold text-white text-left ${isLocked ? "hover:text-orange-400 cursor-pointer" : "cursor-default"}`}
                  >
                    {closestRival.name}
                  </button>
                  <p className="text-xs text-slate-500 mt-0.5">Rank #{closestRival.rank} · {closestRival.points.toLocaleString()} pts</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold tabular-nums text-slate-300" style={{ fontFamily: "Space Mono, monospace" }}>
                    {closestRival.winProb}%
                  </div>
                  <div className="text-[10px] text-slate-500">win prob</div>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-400">Bracket overlap</span>
                  <span className="font-bold text-white tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                    {closestRival.matches}/{player.picks.length} picks match
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(closestRival.matches / player.picks.length) * 100}%` }} />
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  {closestRival.divergences} pick{closestRival.divergences !== 1 ? "s" : ""} differ — those games separate you
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800/60">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
            Leaderboard
          </p>
        </div>
        <div className="divide-y divide-slate-800/40">
          {leaderboard.map(p => (
            <button
              key={p.name}
              onClick={() => isLocked && onSelectPlayer(p.name)}
              className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                p.name === player.name ? "bg-orange-500/10" :
                isLocked ? "hover:bg-slate-800/20 cursor-pointer" : "cursor-default"
              }`}
            >
              <span className="text-xs text-slate-600 w-5 text-right tabular-nums shrink-0" style={{ fontFamily: "Space Mono, monospace" }}>
                {p.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold truncate ${p.name === player.name ? "text-orange-400" : "text-white"}`}>
                    {p.name}
                  </span>
                  {p.champAlive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 font-medium shrink-0">♛</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-slate-500" style={{ fontFamily: "Space Mono, monospace" }}>{p.points.toLocaleString()} pts</span>
                  <span className="text-xs text-slate-600">PPR: {p.ppr}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{
                    fontFamily: "Space Mono, monospace",
                    color: p.winProb > 15 ? "#34d399" : p.winProb > 8 ? "#fbbf24" : "#94a3b8",
                  }}
                >
                  {p.winProb}%
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Leverage Game Card ──────────────────────────────────────────────────────

function LeverageGameCard({ game, player }) {
  const myImpact = game.playerImpacts.find(p => p.player === player?.name);
  const rootFor  = myImpact
    ? (myImpact.ifTeam1 >= myImpact.ifTeam2 ? game.team1 : game.team2)
    : null;

  const isLive = game.status === "live";

  return (
    <div className={`bg-slate-900/60 border rounded-2xl overflow-hidden ${isLive ? "border-red-800/40" : "border-slate-800/60"}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b flex items-center gap-2 ${isLive ? "border-red-800/30 bg-red-950/20" : "border-slate-800/60"}`}>
        {isLive && <LivePing />}
        <span className={`text-xs font-bold ${isLive ? "text-red-300" : "text-slate-300"}`}>
          {game.team1} vs {game.team2}
        </span>
        <span className="text-[10px] text-slate-500 ml-auto">{game.time}</span>
        {/* Leverage badge */}
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
          game.leverage >= 75 ? "bg-red-500/20 text-red-400" :
          game.leverage >= 50 ? "bg-amber-500/20 text-amber-400" :
                                "bg-slate-700/60 text-slate-400"
        }`} style={{ fontFamily: "Space Mono, monospace" }}>
          {game.leverage >= 75 ? "HIGH" : game.leverage >= 50 ? "MED" : "LOW"}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Live score */}
        {isLive && game.score1 != null && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-amber-400 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
              {game.score1}–{game.score2}
            </span>
            {game.gameNote && <span className="text-xs text-slate-500">{game.gameNote}</span>}
          </div>
        )}

        {/* Root for (player-specific) */}
        {rootFor && rootFor !== "TBD" ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Root for:</span>
            <span className="text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-lg">
              {rootFor}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">Root for:</span>
            <span className="text-xs text-slate-600 italic">TBD (Phase 3)</span>
          </div>
        )}

        {/* My win prob impact */}
        {myImpact ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-900/20 border border-emerald-800/20 rounded-xl px-3 py-2 text-center">
              <div className="text-[10px] text-slate-500 mb-0.5">If {game.team1} wins</div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                {myImpact.ifTeam1 >= myImpact.ifTeam2 ? "+" : ""}{(myImpact.ifTeam1 - (myImpact.ifTeam1 + myImpact.ifTeam2) / 2).toFixed(1)}%
              </div>
            </div>
            <div className="bg-red-900/20 border border-red-800/20 rounded-xl px-3 py-2 text-center">
              <div className="text-[10px] text-slate-500 mb-0.5">If {game.team2} wins</div>
              <div className="text-sm font-bold text-red-400 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                {myImpact.ifTeam2 >= myImpact.ifTeam1 ? "+" : ""}{(myImpact.ifTeam2 - (myImpact.ifTeam1 + myImpact.ifTeam2) / 2).toFixed(1)}%
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600 italic">This game doesn't directly affect your win probability.</p>
        )}

        {/* Pick distribution */}
        {game.team1 !== "TBD" && (
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
              <span>{game.team1}</span>
              <span className="text-slate-600 uppercase tracking-wider">Pool picks</span>
              <span>{game.team2}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
              <div className="bg-orange-500/70 h-full transition-all" style={{ width: `${game.pickPct1}%` }} />
              <div className="bg-cyan-600/70 h-full transition-all" style={{ width: `${game.pickPct2}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] mt-0.5" style={{ fontFamily: "Space Mono, monospace" }}>
              <span className="text-orange-400">{game.pickPct1}%</span>
              <span className="text-cyan-400">{game.pickPct2}%</span>
            </div>
          </div>
        )}

        {/* Affects N players */}
        <p className="text-[10px] text-slate-600">
          Affects {game.playerImpacts.length} of {game.playerImpacts.length}+ players in the pool
        </p>
      </div>
    </div>
  );
}

// ─── Game Impact Tab ─────────────────────────────────────────────────────────

function GameImpactTab({ player, leverageGames, threshold }) {
  const keyGames = useMemo(() => {
    return [...leverageGames]
      .filter(g => g.leverage >= threshold)
      .sort((a, b) => {
        // Live games first, then by leverage desc
        if (a.status === "live" && b.status !== "live") return -1;
        if (b.status === "live" && a.status !== "live") return 1;
        return b.leverage - a.leverage;
      });
  }, [leverageGames, threshold]);

  if (keyGames.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-8 text-center">
        <p className="text-slate-500 text-sm">No high-leverage games right now.</p>
        <p className="text-slate-600 text-xs mt-1">Check back when games are underway.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider" style={{ fontFamily: "Space Mono, monospace" }}>
          {keyGames.length} key game{keyGames.length !== 1 ? "s" : ""} · leverage ≥ {threshold}% swing
        </p>
        <p className="text-[10px] text-slate-600">Sorted by impact</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {keyGames.map(game => (
          <LeverageGameCard key={game.id} game={game} player={player} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    PLAYERS,
    LEVERAGE_GAMES,
    LEVERAGE_THRESHOLD,
    BEST_PATH,
    ELIMINATION_STATS,
  } = usePoolData();
  const { pool } = usePool();
  const { profile } = useAuth();

  const isLocked = pool?.locked === true;
  const [selectedName, setSelectedName] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [copied, setCopied] = useState(false);

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

  if (!player) return null;

  function copyInviteLink() {
    const url = `${window.location.origin}/join?code=${pool?.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

      {/* ── Pool Header ────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-bold text-white truncate">{pool?.name ?? "Pool"}</h2>
          <span className="text-xs text-slate-500 shrink-0">
            {PLAYERS.length} {PLAYERS.length === 1 ? "entry" : "entries"}
          </span>
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
        </div>
      </div>

      {/* ── Stat Strip ─────────────────────────────────────────────────────── */}
      <StatStrip player={player} poolSize={PLAYERS.length} />

      {/* ── Toggle ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {[
          { key: "overview",    label: "Overview"    },
          { key: "gameimpact",  label: "Game Impact" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.key
                ? "bg-slate-700 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
            {tab.key === "gameimpact" && LEVERAGE_GAMES.some(g => g.status === "live") && (
              <span className="ml-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* ── Content Area ───────────────────────────────────────────────────── */}
      {activeTab === "overview" ? (
        <OverviewTab
          player={player}
          players={PLAYERS}
          bestPath={BEST_PATH}
          isLocked={isLocked}
          onSelectPlayer={setSelectedName}
        />
      ) : (
        <GameImpactTab
          player={player}
          leverageGames={LEVERAGE_GAMES}
          threshold={LEVERAGE_THRESHOLD}
        />
      )}

    </div>
  );
}

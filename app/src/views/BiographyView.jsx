import { useMemo, useState } from "react";
import { Link, useParams, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePoolData } from "../hooks/usePoolData";
import { DEFAULT_ROUND_POINTS } from "../lib/scoring";
import {
  computeArchetype,
  computeCorrectCalls,
  computeTheTurn,
  computeRoundAnalysis,
} from "../lib/biography";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONO = { fontFamily: "Space Mono, monospace" };

const ROUNDS_ORDER = ["R64", "R32", "S16", "E8", "F4", "Champ"];

function roundLabel(r) {
  return { R64: "R64", R32: "R32", S16: "S16", E8: "E8", F4: "F4", Champ: "Champ" }[r] ?? r;
}

function roundBadgeColor(round) {
  return {
    R64: "bg-slate-700/60 text-slate-300",
    R32: "bg-slate-700/60 text-slate-300",
    S16: "bg-amber-900/40 text-amber-300",
    E8: "bg-amber-900/40 text-amber-300",
    F4: "bg-orange-900/40 text-orange-300",
    Champ: "bg-orange-500/20 text-orange-200",
  }[round] ?? "bg-slate-700/60 text-slate-300";
}

function accuracyColor(pct) {
  if (pct > 60) return "text-emerald-400";
  if (pct >= 30) return "text-amber-400";
  return "text-red-400";
}

function accuracyBg(pct) {
  if (pct > 60) return "bg-emerald-500/10 border-emerald-500/20";
  if (pct >= 30) return "bg-amber-500/10 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
}

// ─── Placeholder ─────────────────────────────────────────────────────────────

function Placeholder({ label }) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80 mb-3" style={MONO}>
        {label}
      </div>
      <p className="text-sm text-slate-600 italic">
        Generate Post-Game Reports from the Admin panel to unlock this section.
      </p>
    </div>
  );
}

// ─── Section Components ──────────────────────────────────────────────────────

function ThesisSection({ thesis }) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 border-l-4 border-l-orange-500 px-6 py-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80 mb-3" style={MONO}>
        The Thesis
      </div>
      {thesis ? (
        <p className="text-sm text-slate-200 leading-relaxed italic">{thesis}</p>
      ) : (
        <p className="text-sm text-slate-600 italic">
          Generate Post-Game Reports from the Admin panel to unlock this section.
        </p>
      )}
    </div>
  );
}

function WhatYouGotRightSection({ prose, calls, teamAbbrev }) {
  if (prose) {
    return (
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80 mb-3" style={MONO}>
          What You Got Right
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">{prose}</p>
      </div>
    );
  }

  // Fallback: show computed bullet list
  if (!calls || calls.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80 mb-3" style={MONO}>
          What You Got Right
        </div>
        <p className="text-sm text-slate-500">No standout contrarian calls — played it close to consensus.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80 mb-4" style={MONO}>
        What You Got Right
      </div>
      <div className="space-y-3">
        {calls.map((c, i) => (
          <div key={i} className="flex items-center gap-3 border-l-4 border-l-emerald-500 pl-4 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-white">
                  {teamAbbrev?.[c.team] ?? c.team}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${roundBadgeColor(c.round)}`} style={MONO}>
                  {roundLabel(c.round)}
                </span>
                <span className="text-xs text-emerald-400 font-semibold" style={MONO}>
                  +{c.pointValue}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Only {c.correctCount} of {c.totalPlayers} had this
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TheTurnSection({ prose, turn, teamAbbrev }) {
  if (prose) {
    return (
      <div className="rounded-2xl border border-red-800/40 bg-red-900/10 px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-red-300/80 mb-3" style={MONO}>
          The Turn
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">{prose}</p>
      </div>
    );
  }

  // Fallback: show computed structural view
  if (!turn) return <Placeholder label="The Turn" />;

  if (turn.isClosestCall) {
    const margin = turn.margin;
    return (
      <div className="rounded-2xl border border-amber-700/40 bg-amber-900/10 px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80 mb-3" style={MONO}>
          The Closest Call
        </div>
        <div className="text-lg font-bold text-white mb-1">
          {turn.team1} {turn.score1} — {turn.team2} {turn.score2}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${roundBadgeColor(turn.round)}`} style={MONO}>
            {roundLabel(turn.round)}
          </span>
          <span className="text-xs text-slate-400">Won by {margin} {margin === 1 ? "point" : "points"}</span>
        </div>
        <p className="text-sm text-slate-300">
          Your pick of <span className="text-white font-semibold">{teamAbbrev?.[turn.team] ?? turn.team}</span> survived by the narrowest margin of the tournament. One possession the other way and this bracket looks very different.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-800/40 bg-red-900/10 px-6 py-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-red-300/80 mb-3" style={MONO}>
        The Turn
      </div>
      <div className="text-lg font-bold text-white mb-1">
        {turn.team1} {turn.score1 ?? "?"} — {turn.team2} {turn.score2 ?? "?"}
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${roundBadgeColor(turn.round)}`} style={MONO}>
          {roundLabel(turn.round)}
        </span>
        <span className="text-xs text-red-400">
          Your pick: <span className="font-semibold">{teamAbbrev?.[turn.team] ?? turn.team}</span>
        </span>
      </div>
      <p className="text-sm text-slate-300">
        {teamAbbrev?.[turn.winner] ?? turn.winner} ended your {teamAbbrev?.[turn.team] ?? turn.team} path here.{" "}
        {turn.downstreamDamage > 0 ? (
          <>
            <span className="text-red-400 font-semibold">{turn.totalDamage} points</span> of total damage
            — {turn.pointsLost} lost here plus {turn.downstreamDamage} from {turn.downstreamSlots} downstream {turn.downstreamSlots === 1 ? "pick" : "picks"} that died with it.
          </>
        ) : (
          <span className="text-red-400 font-semibold">{turn.pointsLost} points</span>
        )}
      </p>
    </div>
  );
}

function ChampionPickStorySection({ prose }) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80 mb-3" style={MONO}>
        Champion Pick Story
      </div>
      {prose ? (
        <p className="text-sm text-slate-200 leading-relaxed">{prose}</p>
      ) : (
        <p className="text-sm text-slate-600 italic">
          Generate Post-Game Reports from the Admin panel to unlock this section.
        </p>
      )}
    </div>
  );
}

function RoundByRoundSection({ analysis, startRound }) {
  if (!analysis || analysis.every(r => r.total === 0)) return null;

  const startIdx = ROUNDS_ORDER.indexOf(startRound ?? "R64");
  const filtered = analysis.filter((r) => ROUNDS_ORDER.indexOf(r.round) >= startIdx);

  if (!filtered.length) return null;

  const cols = filtered.length <= 3 ? filtered.length : 6;

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80 mb-4" style={MONO}>
        Round by Round
      </div>
      <div className={`grid grid-cols-${cols <= 3 ? cols : 3} sm:grid-cols-${Math.min(cols, 6)} gap-3`}>
        {filtered.map((r) => (
          <div
            key={r.round}
            className={`rounded-xl border px-3 py-3 text-center ${r.total > 0 ? accuracyBg(r.accuracy) : "bg-slate-800/40 border-slate-700/40"}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2" style={MONO}>
              {roundLabel(r.round)}
            </div>
            {r.total > 0 ? (
              <>
                <div className={`text-xl font-bold ${accuracyColor(r.accuracy)}`} style={MONO}>
                  {r.accuracy}%
                </div>
                <div className="text-[10px] text-slate-400 mt-1" style={MONO}>
                  {r.correct}/{r.total}
                </div>
                <div className="text-[9px] text-slate-500 mt-1.5">
                  Pool best {r.poolBest}% · Avg {r.poolAvg}%
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-600 mt-2">No games</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BiographyView() {
  const { profile } = useAuth();
  const { pool, brackets } = usePool();
  const { PLAYERS, GAMES, TEAM_ABBREV, simResult } = usePoolData();
  const { playerName: urlPlayerName } = useParams();
  const navigate = useNavigate();

  const decodedName = urlPlayerName ? decodeURIComponent(urlPlayerName) : null;
  const [selectedName, setSelectedName] = useState(decodedName || PLAYERS[0]?.name);

  // No admin gate — all pool members can view reports;

  const player = PLAYERS.find((p) => p.name === selectedName) ?? PLAYERS[0];
  if (!player) return null;

  const playerPicks = player.picks || Array(63).fill(null);

  const allBrackets = useMemo(
    () => PLAYERS.map((p) => ({ name: p.name, picks: p.picks || Array(63).fill(null) })),
    [PLAYERS]
  );

  const archetype = useMemo(
    () => computeArchetype(playerPicks, allBrackets, GAMES),
    [playerPicks, allBrackets, GAMES]
  );

  const correctCalls = useMemo(
    () => computeCorrectCalls(playerPicks, allBrackets, GAMES),
    [playerPicks, allBrackets, GAMES]
  );

  const theTurn = useMemo(
    () => computeTheTurn(playerPicks, GAMES, player.rank),
    [playerPicks, GAMES, player.rank]
  );

  const roundAnalysis = useMemo(
    () => computeRoundAnalysis(playerPicks, allBrackets, GAMES),
    [playerPicks, allBrackets, GAMES]
  );

  // Pull AI-generated report sections
  const reportData = simResult?.biography_theses?.[player.name] ?? null;
  const report = typeof reportData === "object" && reportData !== null ? reportData : null;

  function handlePlayerChange(name) {
    setSelectedName(name);
    navigate(`/reports/biography/${encodeURIComponent(name)}`, { replace: true });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500 no-print">
        <Link to="/reports" className="hover:text-slate-300 transition-colors">Reports</Link>
        <span>/</span>
        <span className="text-slate-300">Post-Game Report</span>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-white">{player.name}</h1>
              <span className="text-[11px] px-3 py-1 rounded-full font-semibold bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30" style={MONO}>
                {archetype.label}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-400">{archetype.description}</p>
          </div>

          {/* Player picker */}
          <div className="no-print">
            <select
              value={selectedName}
              onChange={(e) => handlePlayerChange(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {PLAYERS.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick stats — rank + points only */}
        <div className="mt-5 flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500" style={MONO}>Rank</div>
            <div className="text-xl font-bold text-white" style={MONO}>
              #{player.rank}<span className="text-xs text-slate-500 ml-1">of {PLAYERS.length}</span>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-700/60" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500" style={MONO}>Points</div>
            <div className="text-xl font-bold text-white" style={MONO}>{player.points}</div>
          </div>
        </div>
      </div>

      {/* ── The Thesis ──────────────────────────────────────────────────────── */}
      <ThesisSection thesis={report?.thesis ?? null} />

      {/* ── What You Got Right ──────────────────────────────────────────────── */}
      <WhatYouGotRightSection
        prose={report?.what_you_got_right ?? null}
        calls={correctCalls}
        teamAbbrev={TEAM_ABBREV}
      />

      {/* ── The Turn ────────────────────────────────────────────────────────── */}
      <TheTurnSection
        prose={report?.the_turn ?? null}
        turn={theTurn}
        teamAbbrev={TEAM_ABBREV}
      />

      {/* ── Champion Pick Story ──────────────────────────────────────────────── */}
      <ChampionPickStorySection prose={report?.champion_pick_story ?? null} />

      {/* ── Round by Round ──────────────────────────────────────────────────── */}
      <RoundByRoundSection analysis={roundAnalysis} startRound={pool?.start_round} />

      {/* Print footer */}
      <div className="hidden print:block text-center text-xs text-slate-500 mt-8 pt-4 border-t border-slate-300">
        {pool?.name ?? "Bracket Pool"} — Post-Game Report — {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";

function abbrev(name, map) {
  return (map && name && map[name]) || name || 'TBD';
}

const ROUND_ORDER = { R64: 1, R32: 2, S16: 3, E8: 4, F4: 5, Champ: 6 };

const SORT_OPTIONS = [
  { key: "best", label: "Best To Root For" },
  { key: "danger", label: "Danger Teams" },
  { key: "nextSwing", label: "Next Game Swing" },
  { key: "championshipValue", label: "Championship Value" },
  { key: "poolPct", label: "Pool Exposure" },
  { key: "team", label: "Team" },
];

function formatDelta(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe > 0 ? "+" : ""}${safe.toFixed(1)}%`;
}

function deltaTone(value) {
  if (value > 0.5) return "text-emerald-300";
  if (value < -0.5) return "text-red-300";
  return "text-slate-300";
}

function statusTone(status) {
  if (status === "live") return "border-red-500/20 bg-red-500/10 text-red-300";
  return "border-slate-700/60 bg-slate-800/60 text-slate-300";
}


function labelForRow(row) {
  if (row.rootScore >= 2.5) return { text: "Root hard", cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" };
  if (row.rootScore >= 0.75) return { text: "Helpful", cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" };
  if (row.rootScore <= -2.5) return { text: "Root against", cls: "border-red-500/20 bg-red-500/10 text-red-300" };
  if (row.rootScore <= -0.75) return { text: "Danger team", cls: "border-red-500/20 bg-red-500/10 text-red-300" };
  return { text: "Mildly helpful", cls: "border-slate-700/70 bg-slate-800/60 text-slate-300" };
}

export default function ReportsRootingView() {
  const { PLAYERS, GAMES, LEVERAGE_GAMES, BEST_PATH, TEAM_ABBREV } = usePoolData();
  const { pool } = usePool();
  const { profile } = useAuth();
  const isLocked = pool?.locked === true;
  const [selectedName, setSelectedName] = useState("");
  const [sortBy, setSortBy] = useState("best");

  useEffect(() => {
    if (profile?.username && PLAYERS.find((p) => p.name === profile.username)) {
      setSelectedName(profile.username);
    } else if (PLAYERS.length > 0 && !selectedName) {
      setSelectedName(PLAYERS[0].name);
    }
  }, [profile?.username, PLAYERS, selectedName]);

  const player = useMemo(() => {
    const name = isLocked ? selectedName : (profile?.username ?? selectedName);
    return PLAYERS.find((entry) => entry.name === name) ?? PLAYERS[0] ?? null;
  }, [PLAYERS, isLocked, profile?.username, selectedName]);

  const bestPathTexts = useMemo(
    () => (player ? (BEST_PATH?.[player.name] ?? BEST_PATH?.["_default"] ?? []).map((item) => item.text) : []),
    [BEST_PATH, player]
  );

  const eliminatedTeams = useMemo(() => {
    const eliminated = new Set();
    for (const game of GAMES) {
      if (game.status !== "final" || !game.winner) continue;
      const loser = game.team1 === game.winner ? game.team2 : game.team1;
      if (loser) eliminated.add(loser);
    }
    return eliminated;
  }, [GAMES]);

  const leverageBySlot = useMemo(
    () => Object.fromEntries((LEVERAGE_GAMES ?? []).map((game) => [game.id, game])),
    [LEVERAGE_GAMES]
  );

  const rootingRows = useMemo(() => {
    if (!player) return [];

    const seenTeams = new Set();
    const rows = [];
    const championPick = player.picks?.[62] ?? null;
    const finalFourPicks = new Set([player.picks?.[60], player.picks?.[61], player.picks?.[62]].filter(Boolean));

    for (const game of GAMES) {
      if (game.status === "final") continue;
      for (const team of [game.team1, game.team2]) {
        if (!team || team === "TBD" || eliminatedTeams.has(team) || seenTeams.has(team)) continue;
        seenTeams.add(team);

        const nextGame = GAMES.find(
          (candidate) =>
            candidate.status !== "final" &&
            (candidate.team1 === team || candidate.team2 === team)
        );
        if (!nextGame) continue;

        const impactGame = leverageBySlot[nextGame.slot_index];
        const impact = impactGame?.playerImpacts?.find((entry) => entry.player === player.name);
        const isTeam1 = nextGame.team1 === team;
        const teamShort = abbrev(team, TEAM_ABBREV);
        const modeledWinProb = isTeam1 ? impact?.ifTeam1 : impact?.ifTeam2;
        const nextSwing = modeledWinProb != null && player.winProb != null
          ? modeledWinProb - player.winProb
          : 0;
        const pickedHere = player.picks?.[nextGame.slot_index] === team;
        const poolCount = PLAYERS.filter((entry) => entry.picks?.[nextGame.slot_index] === team).length;
        const poolPct = PLAYERS.length ? Math.round((poolCount / PLAYERS.length) * 100) : 0;

        let championshipValue = 0;
        if (championPick === team) championshipValue += 3.5;
        if (finalFourPicks.has(team)) championshipValue += 1.5;
        if (pickedHere) championshipValue += 1.25;
        if (bestPathTexts.some((text) => text.includes(team))) championshipValue += 1.25;
        if (poolPct < 35) championshipValue += 0.4;
        if (poolPct > 65) championshipValue -= 0.4;

        const rootScore = nextSwing + championshipValue;
        const recommendation = labelForRow({ rootScore });

        rows.push({
          team: teamShort,
          status: nextGame.status,
          nextGameLabel: `${abbrev(nextGame.team1, TEAM_ABBREV)} vs ${abbrev(nextGame.team2, TEAM_ABBREV)}`,
          roundKey: nextGame.roundKey,
          gameTime: nextGame.gameNote || nextGame.gameTime || "Awaiting tip",
          pickedHere,
          poolPct,
          nextSwing,
          leverage: impact?.swing ?? impactGame?.leverage ?? 0,
          championshipValue,
          rootScore,
          recommendation,
          note:
            rootScore >= 0
              ? `${teamShort} supports more of this bracket's live path than it threatens.`
              : `${teamShort} is more likely to strengthen competing paths than this bracket's own route.`,
        });
      }
    }

    return rows;
  }, [BEST_PATH, GAMES, LEVERAGE_GAMES, PLAYERS, bestPathTexts, eliminatedTeams, leverageBySlot, player]);

  const sortedRows = useMemo(() => {
    const rows = [...rootingRows];
    rows.sort((a, b) => {
      if (sortBy === "team") return a.team.localeCompare(b.team);
      if (sortBy === "poolPct") return b.poolPct - a.poolPct;
      if (sortBy === "championshipValue") return b.championshipValue - a.championshipValue;
      if (sortBy === "nextSwing") return b.nextSwing - a.nextSwing;
      if (sortBy === "danger") {
        if (a.rootScore !== b.rootScore) return a.rootScore - b.rootScore;
        if (a.nextSwing !== b.nextSwing) return a.nextSwing - b.nextSwing;
        return b.poolPct - a.poolPct;
      }

      if (b.rootScore !== a.rootScore) return b.rootScore - a.rootScore;
      const aStatus = a.status === "live" ? 0 : 1;
      const bStatus = b.status === "live" ? 0 : 1;
      if (aStatus !== bStatus) return aStatus - bStatus;
      if ((ROUND_ORDER[a.roundKey] ?? 99) !== (ROUND_ORDER[b.roundKey] ?? 99)) {
        return (ROUND_ORDER[a.roundKey] ?? 99) - (ROUND_ORDER[b.roundKey] ?? 99);
      }
      return b.nextSwing - a.nextSwing;
    });
    return rows;
  }, [rootingRows, sortBy]);

  if (!player) return null;

  const rootHardCount = sortedRows.filter((row) => row.recommendation.text === "Root hard").length;
  const dangerCount = sortedRows.filter((row) => row.recommendation.text === "Root against" || row.recommendation.text === "Danger team").length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80">Reports / Whom To Root For</div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">Whom To Root For</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          A personalized rooting guide for {pool?.name ?? "this pool"}, blending immediate game swing with longer-range championship value for {player.name}.
        </p>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {isLocked ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Viewing:</span>
              <select
                value={selectedName}
                onChange={(event) => setSelectedName(event.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {PLAYERS.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
              </select>
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              Viewing: <span className="text-white font-semibold">{player.name}</span>
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-500">
            Current win probability: <span className="text-white font-semibold">{(player.winProb ?? 0).toFixed(1)}%</span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Remaining teams tracked</div>
          <div className="mt-3 text-3xl font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>
            {sortedRows.length}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Root hard spots</div>
          <div className="mt-3 text-3xl font-bold text-emerald-300" style={{ fontFamily: "Space Mono, monospace" }}>
            {rootHardCount}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Danger teams</div>
          <div className="mt-3 text-3xl font-bold text-red-300" style={{ fontFamily: "Space Mono, monospace" }}>
            {dangerCount}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/60">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Recommendation</th>
                <th className="px-4 py-3">Next Spot</th>
                <th className="px-4 py-3">Pool On Them</th>
                <th className="px-4 py-3">Your Pick</th>
                <th className="px-4 py-3">Next Game Swing</th>
                <th className="px-4 py-3">Championship Value</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={`${row.team}-${row.roundKey}`} className="border-b border-slate-800/60 last:border-b-0 align-top">
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-white">{row.team}</div>
                    <div className="mt-1">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.status)}`}>
                        {row.status === "live" ? "Live now" : row.roundKey}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${row.recommendation.cls}`}>
                      {row.recommendation.text}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-200">{row.nextGameLabel}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{row.gameTime}</div>
                  </td>
                  <td
                    className="px-4 py-3 text-sm font-semibold text-slate-300 tabular-nums"
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {row.poolPct}%
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      row.pickedHere
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-slate-700/70 bg-slate-800/60 text-slate-300"
                    }`}>
                      {row.pickedHere ? "You picked them" : "Not your path"}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-sm font-bold tabular-nums ${deltaTone(row.nextSwing)}`}
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {formatDelta(row.nextSwing)}
                  </td>
                  <td
                    className={`px-4 py-3 text-sm font-bold tabular-nums ${deltaTone(row.championshipValue)}`}
                    style={{ fontFamily: "Space Mono, monospace" }}
                  >
                    {formatDelta(row.championshipValue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

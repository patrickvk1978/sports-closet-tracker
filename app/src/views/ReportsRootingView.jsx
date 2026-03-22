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

function pluralizeBrackets(count) {
  return `${count} other bracket${count === 1 ? "" : "s"}`;
}

function bracketsHavePhrase(count) {
  return count === 1 ? "1 other bracket has" : `${count} other brackets have`;
}

function noteVariantIndex(...parts) {
  const text = parts.filter(Boolean).join("|");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function chooseNote(options, seed, avoid) {
  if (!options.length) return "";
  const ordered = options.map((option, index) => ({
    option,
    score: (seed + index * 17) % 997,
  })).sort((a, b) => a.score - b.score);
  const preferred = ordered.find(({ option }) => option !== avoid);
  return (preferred ?? ordered[0]).option;
}

function normalizeRootingNote(note) {
  return String(note || "")
    .replace(/\b[A-Z]{2,6}\b/g, "TEAM")
    .replace(/\b\d+(?:\.\d+)?%?\b/g, "NUM")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueifyRootingNotes(rows) {
  const seenNotes = new Set();
  const seenKinds = new Set();
  return rows.map((row, index) => {
    let note = row.note;
    let attempt = 0;
    let kindKey = `${row.noteKind}:${normalizeRootingNote(note)}`;

    while ((seenNotes.has(note) || seenKinds.has(kindKey)) && attempt < 6) {
      const seed = noteVariantIndex(row.team, row.roundKey, row.noteKind, row.poolPct, Math.round(row.nextSwing * 10), attempt, index);
      const fallbackPools = {
        counter: [
          `${row.team} is not really your team, but the field would still feel it if they keep moving.`,
          `${row.team} is an awkward root, though the ripple effects still break more your way than the pool's.`,
          `You would not naturally circle ${row.team}, but this is still one of those results that can help by making life harder on competing brackets.`,
          `${row.team} is more useful as a spoiler than as a true ally for your bracket.`,
        ],
        short_term: [
          `${row.team} is helping you for now, but the longer they stay alive, the more dangerous they become.`,
          `This is a classic short-term friend, long-term problem situation for ${row.team}.`,
          `${row.team} can still do useful work for your bracket, just preferably before they become everyone else's payoff.`,
          `You can live with ${row.team} winning now, but there is a clear expiration date on that arrangement.`,
        ],
        background: [
          `${row.team} is more useful as optional upside than urgent rooting drama.`,
          `This is a quieter edge, but still one worth keeping on the board.`,
          `${row.team} is not a headline need for your bracket, just a result that happens to age well for you.`,
          `Think of ${row.team} as a decent supporting result rather than a must-have.`,
        ],
        danger: [
          `${row.team} is carrying more value for the field than for you right now, which is why their exit would help.`,
          `${row.team} is the kind of team that gets more dangerous the longer the pool stays invested in them.`,
          `This is less about loving the other side and more about wanting ${row.team} out of the shared bloodstream.`,
          `${row.team} is helping too many rivals at the moment to feel comfortable.`,
          `${row.team} is the sort of live grenade you would rather see someone else catch.`,
          `The problem with ${row.team} is not style points. It is the amount of damage they can still do if left alive.`,
        ],
        default: [
          `${row.team} is still worth tracking here, just not for exactly the same reason as the nearby rows.`,
          `Similar category, different payoff. ${row.team} still changes your picture in its own way.`,
          `${row.team} belongs in this section even if the logic overlaps a bit with another team.`,
          `This is another live rooting angle, but not just a copy of the row above.`,
        ],
      };

      const pool = fallbackPools[row.noteKind] ?? fallbackPools.default;
      note = chooseNote(pool, seed, note);
      kindKey = `${row.noteKind}:${normalizeRootingNote(note)}`;
      attempt += 1;
    }

    seenNotes.add(note);
    seenKinds.add(kindKey);
    return { ...row, note };
  });
}

function rootingNote({
  teamShort,
  championPick,
  pickedHere,
  nextGame,
  team,
  player,
  PLAYERS,
  nextSwing,
  poolPct,
  championshipValue,
}) {
  const nextSlot = nextGame?.slot_index ?? -1;
  const laterSlots = Array.from({ length: 63 - Math.max(nextSlot + 1, 0) }, (_, i) => i + nextSlot + 1);
  const otherPlayers = PLAYERS.filter((entry) => entry.name !== player.name);
  const otherChampCount = otherPlayers.filter((entry) => entry.picks?.[62] === team).length;
  const otherDeeperCount = otherPlayers.filter((entry) =>
    laterSlots.some((slot) => entry.picks?.[slot] === team)
  ).length;
  const yourFutureRounds = laterSlots.filter((slot) => player.picks?.[slot] === team).length;
  const teamWinsHelpNow = nextSwing > 0.6;
  const teamHurtsNow = nextSwing < -0.6;
  const seed = noteVariantIndex(teamShort, player?.name, nextGame?.slot_index, championPick, pickedHere, otherChampCount, otherDeeperCount, poolPct, Math.round(nextSwing * 10));

  if (championPick === team && otherChampCount === 0) {
    return {
      noteKind: "champ_unique",
      note: chooseNote([
        `This is your champion, and nobody else has them cutting down the nets. About as clean a rooting interest as you can get.`,
        `${teamShort} is your last-team-standing dream, and the rest of the pool does not share it. That is a beautiful setup.`,
        `This is the easiest note in the report: ${teamShort} is your champion and basically your private upside.`,
        `${teamShort} is where your bracket can separate from the whole pool in one clean shot.`,
      ], seed),
    };
  }

  if (championPick === team && otherChampCount > 0) {
    return {
      noteKind: "champ_shared",
      note: chooseNote([
        `This is still your champion, but ${bracketsHavePhrase(otherChampCount)} them winning it all, so you want them alive without letting the field pile up too much value.`,
        `${teamShort} is still your title team, but you are not alone. The trick is keeping them alive without letting the rest of the pool cash too hard.`,
        `You still need ${teamShort} for the big prize, but enough other brackets are riding them too that every win is a little complicated.`,
        `${teamShort} is your champion, just not your private champion, which makes every extra win a little more crowded.`,
      ], seed),
    };
  }

  if (!pickedHere && teamWinsHelpNow && otherDeeperCount > 0) {
    return {
      noteKind: "counter",
      note: chooseNote([
        `Even though you have ${teamShort} losing this exact game, a win here actually helps because ${bracketsHavePhrase(otherDeeperCount)} them going even further.`,
        `This is one of those weird pool spots where your bracket says lose, but your odds say survive. ${teamShort} winning would hurt other brackets more later.`,
        `${teamShort} is a little counterintuitive here: you picked against them now, but keeping them alive actually does more damage to the field.`,
        `${teamShort} surviving here would be bad for your bracket sheet and good for your title odds, which tells you a lot about the rest of the pool.`,
      ], seed),
    };
  }

  if (pickedHere && otherChampCount > 0 && yourFutureRounds < 2) {
    return {
      noteKind: "short_term",
      note: chooseNote([
        `You still need ${teamShort} for now, but ${bracketsHavePhrase(otherChampCount)} them as champion, so there is real value in them exiting before they become a bigger problem.`,
        `You are fine with ${teamShort} surviving this round, but not much longer. Too many other brackets still have bigger plans for them.`,
        `${teamShort} is useful to you in the short term and dangerous in the long term. That tension is the whole story here.`,
        `${teamShort} can help you a little right now, but the field starts cashing much harder if they stick around too long.`,
      ], seed),
    };
  }

  if (pickedHere && yourFutureRounds >= 2 && otherChampCount === 0) {
    return {
      noteKind: "deep_personal",
      note: chooseNote([
        `You have ${teamShort} going ${yourFutureRounds + 1} more round${yourFutureRounds + 1 === 1 ? "" : "s"}, and the rest of the pool is not nearly as invested. That's a strong personal path.`,
        `${teamShort} runs through a lot of your future bracket, and the field is not nearly as exposed. That is real personal leverage.`,
        `There is some genuine upside here because you still have ${teamShort} alive deeper than most of the pool does.`,
        `${teamShort} is one of the places where your bracket still owns some real private upside.`,
      ], seed),
    };
  }

  if (!pickedHere && teamHurtsNow && poolPct >= 45) {
    return {
      noteKind: "danger",
      note: chooseNote([
        `${teamShort} is dangerous mostly because too much of the pool still benefits if they keep moving. Their loss would clear space for your bracket.`,
        `This is less about your bracket loving the other side and more about too much of the pool still being alive on ${teamShort}.`,
        `${teamShort} is carrying a lot of public equity right now. If they go down, the path gets cleaner for you fast.`,
        `${teamShort} is one of those teams the pool has left hanging around a little too long for your liking.`,
        `${teamShort} is a problem because too many rival brackets still have life tied to them. The longer that lasts, the worse this gets.`,
        `${teamShort} has turned into a shared threat. If they keep winning, too many other brackets get to stay dangerous with them.`,
      ], seed),
    };
  }

  if (!pickedHere && teamWinsHelpNow) {
    return {
      noteKind: "counter",
      note: chooseNote([
        `${teamShort} is a little counterintuitive: they are not really your team, but them winning here helps thin out stronger competing paths.`,
        `This one is sneaky. ${teamShort} is not part of your dream bracket, but them surviving helps knock loose stronger competing routes.`,
        `You are not exactly rooting for ${teamShort} in a vacuum, but this is the kind of result that can make the field's life harder than yours.`,
        `${teamShort} is not really a true ally, but a win here would still do useful work against stronger competing paths.`,
        `This is one of those awkward roots: ${teamShort} is not your team, yet them advancing would still help clutter the field in the right way.`,
        `${teamShort} is not central to your bracket, but them hanging around can still make life messier for the brackets you are chasing.`,
      ], seed),
    };
  }

  if (pickedHere && championshipValue > 2) {
    return {
      noteKind: "path_flex",
      note: chooseNote([
        `${teamShort} shows up in a lot of your live path, so keeping them alive buys you flexibility in later rounds.`,
        `${teamShort} still touches enough of your future bracket that a win here preserves options you may need later.`,
        `This is not just about one game. ${teamShort} still props up enough of your bracket to matter downstream too.`,
        `${teamShort} is still supporting enough of your bracket that you do not really want to lose them yet.`,
      ], seed),
    };
  }

  if (teamHurtsNow) {
    return {
      noteKind: "danger",
      note: chooseNote([
        `${teamShort} does more for the other live brackets than for yours right now. If they go down, your route gets cleaner.`,
        `${teamShort} is helping the competition more than they are helping you at the moment. That is usually a bad sign.`,
        `This is one where the cleanest outcome for your bracket is simply ${teamShort} getting out of the way.`,
        `${teamShort} is doing more good elsewhere than they are doing for you, which makes this an easy fade.`,
        `${teamShort} is not your problem because of who they are. They are your problem because of how many brackets still wake up alive if they win.`,
        `${teamShort} is the kind of team that keeps bad bracket news alive for one more day. Better to see them shut off now.`,
      ], seed),
    };
  }

  if (teamWinsHelpNow) {
    return {
      noteKind: "background",
      note: chooseNote([
        `${teamShort} quietly helps more of your live path than the rest of the field's. Not flashy, but useful.`,
        `${teamShort} is more of a quiet helper than a headline team for you, but those are still worth tracking.`,
        `There is no huge story here, just a result that happens to break a little better for you than for the field.`,
        `${teamShort} is the kind of team you are happy to have in your corner even if they are not the headline.`,
      ], seed),
    };
  }

  return {
    noteKind: "background",
    note: chooseNote([
      `${teamShort} matters, just not in a dramatic way yet. This is more about keeping your options open than a must-have result.`,
      `This is more background value than urgent rooting drama. Useful to have, not devastating to lose.`,
      `${teamShort} is in the picture, just not at center stage. Think of this as optional upside rather than a must-win path.`,
      `${teamShort} is still part of the story, just more as a supporting character than a lead.`,
    ], seed),
  };
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
        const noteData = rootingNote({
          teamShort,
          championPick,
          pickedHere,
          nextGame,
          team,
          player,
          PLAYERS,
          nextSwing,
          poolPct,
          championshipValue,
        });

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
          noteKind: noteData.noteKind,
          note: noteData.note,
        });
      }
    }

    return uniqueifyRootingNotes(rows);
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

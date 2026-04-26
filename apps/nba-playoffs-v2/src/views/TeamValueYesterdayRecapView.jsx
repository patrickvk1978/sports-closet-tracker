import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { useEspnTodayGames, useEspnYesterdayGames } from "../hooks/useEspnTodayGames";
import {
  buildTeamValueBranchMonteCarlo,
  buildTeamValueStandingsWithMonteCarlo,
  getRoundOneTeamsFromData,
} from "../lib/teamValuePreview";
import { buildTeamValueStandings } from "../lib/teamValueStandings";

function samePair(seriesItem, game) {
  const seriesTeams = [seriesItem.homeTeam?.id ?? seriesItem.homeTeamId, seriesItem.awayTeam?.id ?? seriesItem.awayTeamId].sort().join("|");
  const gameTeams = [game.homeTeamId, game.awayTeamId].sort().join("|");
  return seriesTeams === gameTeams;
}

function getSeriesTeamIds(seriesItem) {
  return {
    homeId: seriesItem.homeTeam?.id ?? seriesItem.homeTeamId,
    awayId: seriesItem.awayTeam?.id ?? seriesItem.awayTeamId,
    homeAbbr: seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId?.toUpperCase?.() ?? "HOME",
    awayAbbr: seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId?.toUpperCase?.() ?? "AWAY",
  };
}

function getGameWinnerId(game) {
  const homeScore = Number(game.homeScore ?? 0);
  const awayScore = Number(game.awayScore ?? 0);
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
}

function buildFinalScoreLabel(game) {
  return `${game.awayAbbreviation} ${game.awayScore} · ${game.homeAbbreviation} ${game.homeScore}`;
}

function formatTipTime(tipAt) {
  if (!tipAt) return "Time TBD";
  const date = new Date(tipAt);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSeriesStatus(seriesItem) {
  const { homeId, awayId, homeAbbr, awayAbbr } = getSeriesTeamIds(seriesItem);
  const conference = seriesItem.conference === "west" ? "West" : "East";
  const roundLabel = seriesItem.roundKey === "round_1" ? "1st Round" : "Playoff";
  const homeWins = Number(seriesItem.wins?.home ?? 0);
  const awayWins = Number(seriesItem.wins?.away ?? 0);
  const nextGameNumber = Math.min(homeWins + awayWins + 1, 7);

  if (homeWins >= 4 || awayWins >= 4 || seriesItem.status === "completed") {
    const winner = seriesItem.winnerTeamId === awayId || awayWins > homeWins ? awayAbbr : homeId ? homeAbbr : "Winner";
    const finalWins = Math.max(homeWins, awayWins);
    const finalLosses = Math.min(homeWins, awayWins);
    return `${conference} ${roundLabel} · ${winner} wins series ${finalWins}-${finalLosses}`;
  }

  if (homeWins === awayWins) {
    return `${conference} ${roundLabel} · Game ${nextGameNumber} · Series tied ${homeWins}-${awayWins}`;
  }

  const leader = homeWins > awayWins ? homeAbbr : awayAbbr;
  return `${conference} ${roundLabel} · Game ${nextGameNumber} · ${leader} leads series ${Math.max(homeWins, awayWins)}-${Math.min(homeWins, awayWins)}`;
}

function buildSeriesBeforeGame(seriesItem, game) {
  const winnerId = getGameWinnerId(game);
  const { homeId, awayId } = getSeriesTeamIds(seriesItem);
  const wins = {
    home: Number(seriesItem.wins?.home ?? 0),
    away: Number(seriesItem.wins?.away ?? 0),
  };

  if (winnerId === homeId) wins.home = Math.max(wins.home - 1, 0);
  if (winnerId === awayId) wins.away = Math.max(wins.away - 1, 0);

  return {
    ...seriesItem,
    wins,
    homeWins: wins.home,
    awayWins: wins.away,
    status: "in_progress",
    winnerTeamId: null,
  };
}

function buildSeriesBeforeGames(series, gameSeriesPairs) {
  const gamesBySeriesId = gameSeriesPairs.reduce((acc, pair) => {
    acc[pair.seriesItem.id] = [...(acc[pair.seriesItem.id] ?? []), pair.game];
    return acc;
  }, {});

  return series.map((seriesItem) => {
    const games = gamesBySeriesId[seriesItem.id] ?? [];
    if (!games.length) return seriesItem;
    return games.reduce((updatedSeriesItem, game) => buildSeriesBeforeGame(updatedSeriesItem, game), seriesItem);
  });
}

function buildSeriesAfterGame(seriesItem, game) {
  const winnerId = getGameWinnerId(game);
  const { homeId, awayId } = getSeriesTeamIds(seriesItem);
  const wins = {
    home: Number(seriesItem.wins?.home ?? 0),
    away: Number(seriesItem.wins?.away ?? 0),
  };

  if (winnerId === homeId) wins.home = Math.min(wins.home + 1, 4);
  if (winnerId === awayId) wins.away = Math.min(wins.away + 1, 4);

  return {
    ...seriesItem,
    wins,
    homeWins: wins.home,
    awayWins: wins.away,
    status: wins.home >= 4 || wins.away >= 4 ? "completed" : seriesItem.status,
    winnerTeamId: wins.home >= 4 ? homeId : wins.away >= 4 ? awayId : seriesItem.winnerTeamId ?? null,
  };
}

function buildSeriesAfterGames(series, gameSeriesPairs) {
  const gamesBySeriesId = gameSeriesPairs.reduce((acc, pair) => {
    acc[pair.seriesItem.id] = [...(acc[pair.seriesItem.id] ?? []), pair.game];
    return acc;
  }, {});

  return series.map((seriesItem) => {
    const games = gamesBySeriesId[seriesItem.id] ?? [];
    if (!games.length) return seriesItem;
    return games.reduce((updatedSeriesItem, game) => buildSeriesAfterGame(updatedSeriesItem, game), seriesItem);
  });
}

function formatMemberName(member, currentUserId) {
  if (!member) return "Unknown";
  return member.id === currentUserId ? "You" : member.displayName ?? member.name ?? "Unknown";
}

function ordinal(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return "—";
  const suffix = normalized % 10 === 1 && normalized % 100 !== 11
    ? "st"
    : normalized % 10 === 2 && normalized % 100 !== 12
      ? "nd"
      : normalized % 10 === 3 && normalized % 100 !== 13
        ? "rd"
        : "th";
  return `${normalized}${suffix}`;
}

function signedNumber(value, suffix = "") {
  const normalized = Number(value ?? 0);
  if (!normalized) return "Even";
  return `${normalized > 0 ? "+" : ""}${normalized}${suffix}`;
}

function formatPercentPhrase(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "an unclear chance";
}

function teamName(team, fallback) {
  if (!team) return fallback ?? "that team";
  if (team.city && team.name) return `${team.city} ${team.name}`;
  return team.city ?? team.name ?? team.abbreviation ?? fallback ?? "that team";
}

function teamShortName(team, fallback) {
  return team?.city ?? team?.abbreviation ?? fallback ?? "that team";
}

function getSeriesChance(seriesItem, teamId, nextGame = null) {
  const { homeId, awayId } = getSeriesTeamIds(seriesItem);
  const wins = {
    home: Number(seriesItem.wins?.home ?? 0),
    away: Number(seriesItem.wins?.away ?? 0),
  };
  const teamWins = teamId === homeId ? wins.home : teamId === awayId ? wins.away : null;
  const opponentWins = teamId === homeId ? wins.away : teamId === awayId ? wins.home : null;
  if (teamWins == null || opponentWins == null) return null;
  if (teamWins >= 4) return 100;
  if (opponentWins >= 4) return 0;

  const nextGameTeamPct = nextGame
    ? teamId === nextGame.homeTeamId
      ? nextGame.homeWinPct
      : teamId === nextGame.awayTeamId
        ? nextGame.awayWinPct
        : null
    : null;
  const marketTeamPct = teamId === homeId
    ? Number(seriesItem.market?.homeTeamPct ?? seriesItem.market?.homeWinPct ?? 50)
    : Number(seriesItem.market?.awayTeamPct ?? (100 - Number(seriesItem.market?.homeWinPct ?? 50)));
  const perGamePct = Math.max(5, Math.min(95, Number(nextGameTeamPct ?? marketTeamPct ?? 50))) / 100;
  const teamNeeded = 4 - teamWins;
  const opponentNeeded = 4 - opponentWins;
  let seriesWinProbability = 0;

  for (let remainingGames = teamNeeded; remainingGames <= teamNeeded + opponentNeeded - 1; remainingGames += 1) {
    const opponentWinsBeforeClincher = remainingGames - teamNeeded;
    if (opponentWinsBeforeClincher < 0 || opponentWinsBeforeClincher >= opponentNeeded) continue;
    seriesWinProbability +=
      combination(remainingGames - 1, teamNeeded - 1) *
      perGamePct ** teamNeeded *
      (1 - perGamePct) ** opponentWinsBeforeClincher;
  }

  return Math.round(seriesWinProbability * 100);
}

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - (k - index))) / index;
  }
  return result;
}

function buildMovementRows(previousStandings, currentStandings, currentUserId) {
  const previousById = Object.fromEntries(previousStandings.map((row) => [row.id, row]));
  return currentStandings.map((current) => {
    const previous = previousById[current.id] ?? null;
    const pointsDelta = Number(current.summary.totalPoints ?? 0) - Number(previous?.summary.totalPoints ?? 0);
    const placeDelta = Number(previous?.place ?? current.place) - Number(current.place ?? 0);
    const winDelta = Number((Number(current.winProbability ?? 0) - Number(previous?.winProbability ?? 0)).toFixed(1));
    return {
      id: current.id,
      name: formatMemberName(current, currentUserId),
      previousPlace: previous?.place ?? current.place,
      currentPlace: current.place,
      placeDelta,
      points: current.summary.totalPoints,
      pointsDelta,
      winProbability: current.winProbability ?? 0,
      winDelta,
    };
  });
}

function buildGameImpactRows(pair, memberList, allAssignmentsByUser, currentSeries, currentUserId, playoffTeams) {
  const winnerId = getGameWinnerId(pair.game);
  const beforeGameSeries = currentSeries.map((seriesItem) =>
    seriesItem.id === pair.seriesItem.id ? buildSeriesBeforeGame(seriesItem, pair.game) : seriesItem
  );
  const beforeStandings = buildTeamValueStandings(memberList, allAssignmentsByUser, beforeGameSeries);
  const afterStandings = buildTeamValueStandings(memberList, allAssignmentsByUser, currentSeries);
  const beforeById = Object.fromEntries(beforeStandings.map((row) => [row.id, row]));
  const winnerTeam = playoffTeams.find((team) => team.id === winnerId);

  return afterStandings.map((after) => {
    const before = beforeById[after.id] ?? null;
    const assignments = allAssignmentsByUser?.[after.id] ?? {};
    const winnerValue = Number(assignments?.[winnerId] ?? 0);
    return {
      id: after.id,
      name: formatMemberName(after, currentUserId),
      resultPoints: Number(after.summary.totalPoints ?? 0) - Number(before?.summary.totalPoints ?? 0),
      placeDelta: Number(before?.place ?? after.place) - Number(after.place ?? 0),
      winnerValue,
      note: winnerValue > 0
        ? `${winnerTeam?.abbreviation ?? "Winner"} was worth ${winnerValue}`
        : "No direct result points",
    };
  });
}

function buildGameResultNarratives(pair, impactRows, currentUserId, allAssignmentsByUser, memberList, playoffTeams) {
  const winnerId = getGameWinnerId(pair.game);
  const { homeAbbr, awayAbbr } = getSeriesTeamIds(pair.seriesItem);
  const winnerAbbr = winnerId === pair.game.homeTeamId ? pair.game.homeAbbreviation : pair.game.awayAbbreviation;
  const loserAbbr = winnerId === pair.game.homeTeamId ? pair.game.awayAbbreviation : pair.game.homeAbbreviation;
  const winnerTeam = playoffTeams.find((team) => team.id === winnerId);
  const winnerName = teamName(winnerTeam, winnerAbbr);
  const winnerShort = teamShortName(winnerTeam, winnerAbbr);
  const userRow = impactRows.find((row) => row.id === currentUserId);
  const topPoints = [...impactRows].sort((a, b) => b.resultPoints - a.resultPoints || b.placeDelta - a.placeDelta)[0];
  const climbers = impactRows.filter((row) => row.placeDelta > 0);
  const harmed = impactRows.filter((row) => row.placeDelta < 0);
  const roomPointTotal = impactRows.reduce((sum, row) => sum + Number(row.resultPoints ?? 0), 0);
  const averagePoints = impactRows.length ? Number((roomPointTotal / impactRows.length).toFixed(1)) : 0;
  const userWinnerValue = Number(allAssignmentsByUser?.[currentUserId]?.[winnerId] ?? 0);
  const winnerValues = memberList
    .map((member) => Number(allAssignmentsByUser?.[member.id]?.[winnerId] ?? 0))
    .filter((value) => value > 0);
  const maxWinnerValue = winnerValues.length ? Math.max(...winnerValues) : 0;
  const usersAtMax = memberList.filter((member) => Number(allAssignmentsByUser?.[member.id]?.[winnerId] ?? 0) === maxWinnerValue);
  const userHasUniqueTopWinner = userWinnerValue > 0 && userWinnerValue === maxWinnerValue && usersAtMax.length === 1;
  const futureValueSentence = userHasUniqueTopWinner
    ? `You are the only synced board with ${winnerName} in the top slot, so the bigger value is not just yesterday's points; it is that every ${winnerShort} win protects a long-term advantage only you currently have.`
    : userWinnerValue >= 13
      ? `${winnerName} is one of your premium assets, so this win matters beyond the standings line: it keeps a high-value path alive for later rounds.`
      : userWinnerValue > 0
        ? `${winnerName} is not your biggest asset, but the win still keeps useful future value in play if this series keeps bending your way.`
        : `The long-term value is indirect for you: ${winnerName} winning helps the boards that invested there, while your path depends on whether the other side can still create separation later.`;

  const userNarrative = userRow
    ? userRow.resultPoints > 0
      ? `${winnerName} gave you ${userRow.resultPoints} points from this result. ${userRow.placeDelta > 0 ? `That was enough to move you up ${userRow.placeDelta} spot${userRow.placeDelta === 1 ? "" : "s"}.` : userRow.placeDelta < 0 ? `Even with those points, other boards got more from the same result and you slid ${Math.abs(userRow.placeDelta)} spot${Math.abs(userRow.placeDelta) === 1 ? "" : "s"}.` : "It did not change your place, but it did keep your board on pace in this series."} ${futureValueSentence}`
      : `${winnerName} did not give your board direct points, so this result was mostly about damage control and field movement. ${userRow.placeDelta < 0 ? `You lost ${Math.abs(userRow.placeDelta)} spot${Math.abs(userRow.placeDelta) === 1 ? "" : "s"} because other boards had more tied to the winner.` : userRow.placeDelta > 0 ? `You still moved up ${userRow.placeDelta} spot${userRow.placeDelta === 1 ? "" : "s"}, which means the result hurt nearby boards even more than it hurt yours.` : "Your place held, which means the room did not create much separation from this one result."} ${futureValueSentence}`
    : `This result is readable at the pool level, but your board is not available in the synced movement rows.`;

  const poolNarrative = topPoints
    ? `${winnerAbbr}-${loserAbbr} moved the room through ${winnerAbbr} exposure. ${topPoints.name} banked the biggest direct gain at ${topPoints.resultPoints} points, while ${climbers.length ? `${climbers.length} board${climbers.length === 1 ? "" : "s"} moved up the standings` : "the standings order mostly held"}. The average visible board gained ${averagePoints} points here, so this was ${averagePoints >= 10 ? "a real scoring event for the pool" : averagePoints >= 5 ? "a moderate room mover" : "more texture than earthquake"}${harmed.length ? `, with ${harmed.length} board${harmed.length === 1 ? "" : "s"} losing position despite the final.` : "."}`
    : `${homeAbbr}-${awayAbbr} did not create a clear direct-points separation across the room.`;

  return {
    user: userNarrative,
    pool: poolNarrative,
  };
}

function buildNextGamePreview(pair, memberList, allAssignmentsByUser, series, playoffTeams, currentUserId, nextGame) {
  const { homeId, awayId, homeAbbr, awayAbbr } = getSeriesTeamIds(pair.seriesItem);
  const homeBranch = buildTeamValueBranchMonteCarlo(memberList, allAssignmentsByUser, series, playoffTeams, pair.seriesItem.id, homeId);
  const awayBranch = buildTeamValueBranchMonteCarlo(memberList, allAssignmentsByUser, series, playoffTeams, pair.seriesItem.id, awayId);
  const currentHome = homeBranch[currentUserId];
  const currentAway = awayBranch[currentUserId];
  const userDelta = currentHome && currentAway
    ? Number((Number(homeBranch[currentUserId]?.winProbability ?? 0) - Number(awayBranch[currentUserId]?.winProbability ?? 0)).toFixed(1))
    : 0;
  const bestRows = memberList
    .map((member) => {
      const homeWin = Number(homeBranch[member.id]?.winProbability ?? 0);
      const awayWin = Number(awayBranch[member.id]?.winProbability ?? 0);
      const delta = Number((homeWin - awayWin).toFixed(1));
      return {
        id: member.id,
        name: formatMemberName(member, currentUserId),
        side: delta >= 0 ? homeAbbr : awayAbbr,
        swing: Math.abs(delta),
        rawDelta: delta,
      };
    })
    .sort((a, b) => b.swing - a.swing)
    .slice(0, 3);
  const userSide = userDelta >= 0 ? homeAbbr : awayAbbr;
  const otherSide = userDelta >= 0 ? awayAbbr : homeAbbr;
  const userSideId = userDelta >= 0 ? homeId : awayId;
  const winnerId = getGameWinnerId(pair.game);
  const winnerTeam = playoffTeams.find((team) => team.id === winnerId);
  const userSideTeam = playoffTeams.find((team) => team.id === userSideId);
  const averageSwing = bestRows.length
    ? Number((bestRows.reduce((sum, row) => sum + row.swing, 0) / bestRows.length).toFixed(1))
    : 0;
  const userImpactLabel = Math.abs(userDelta) >= 8 ? "major" : Math.abs(userDelta) >= 4 ? "moderate" : Math.abs(userDelta) >= 1.5 ? "modest" : "small";
  const nextGamePct = nextGame
    ? userSideId === nextGame.homeTeamId
      ? nextGame.homeWinPct
      : userSideId === nextGame.awayTeamId
        ? nextGame.awayWinPct
        : null
    : null;
  const seriesChance = getSeriesChance(pair.seriesItem, winnerId, nextGame);
  const topRow = bestRows[0] ?? null;
  const topName = topRow?.id === currentUserId ? "you" : topRow?.name;

  return {
    title: `Next Game Preview`,
    userText: userDelta === 0
      ? `With the victory, ${teamShortName(winnerTeam, winnerAbbrForTeam(winnerId, homeId, homeAbbr, awayAbbr))} now has ${formatPercentPhrase(seriesChance)} of taking the series. The next game looks close to neutral for your pool equity right now, so the more interesting read may be which other boards are exposed.`
      : `With the victory, ${teamShortName(winnerTeam, winnerAbbrForTeam(winnerId, homeId, homeAbbr, awayAbbr))} now has ${formatPercentPhrase(seriesChance)} of taking the series. ${nextGamePct != null ? `The early ESPN read gives ${teamShortName(userSideTeam, userSide)} a ${nextGamePct}% chance in the next game.` : "The next-game market is not fully posted yet."} A ${userSide} result would have a ${userImpactLabel} impact on your pool path, moving you about ${Math.abs(userDelta).toFixed(1)} win-probability points compared with ${otherSide}.`,
    poolText: bestRows.length
      ? `${topName} would see the single biggest bump if ${topRow.side} wins, with a ${topRow.swing.toFixed(1)}-point swing. The broader pressure cluster is ${bestRows.map((row) => `${row.name} toward ${row.side}`).join(" · ")}, which is the lane tomorrow's Briefing should unpack.`
      : "The next game is not showing a clear room pressure point yet.",
  };
}

function winnerAbbrForTeam(teamId, homeId, homeAbbr, awayAbbr) {
  return teamId === homeId ? homeAbbr : awayAbbr;
}

function buildRecapNarratives(movementRows, currentUserId, isTodayRecap = false) {
  const userRow = movementRows.find((row) => row.id === currentUserId);
  const biggestClimber = [...movementRows].sort((a, b) => b.placeDelta - a.placeDelta || b.pointsDelta - a.pointsDelta)[0];
  const biggestWinProb = [...movementRows].sort((a, b) => b.winDelta - a.winDelta)[0];
  const dayLabel = isTodayRecap ? "today" : "yesterday";
  const finishedLabel = isTodayRecap ? "so far today" : "yesterday";

  return {
    user: userRow
      ? `You ${isTodayRecap ? "are sitting" : "finished the day"} ${ordinal(userRow.currentPlace)}, with ${signedNumber(userRow.pointsDelta, " pts")} from ${dayLabel}'s completed games and ${signedNumber(userRow.winDelta, " pts")} of pool-win movement. The clean read: ${finishedLabel} ${userRow.placeDelta > 0 ? "moved you up the board" : userRow.placeDelta < 0 ? "cost you position" : "mostly held your position"}, but the simulation movement matters more than the raw place line.`
      : "Your board is not synced into this pool read yet, so the recap can summarize the room but cannot give a reliable personal movement read.",
    pool: biggestClimber
      ? `${biggestClimber.name} had the clearest standings move, while ${biggestWinProb?.name ?? biggestClimber.name} gained the most pool equity. The room shifted less like a simple leaderboard shuffle and more like a leverage map: the same final scores helped some boards bank points while opening or closing future paths for others.`
      : "Yesterday did not create enough movement to separate the room in a meaningful way.",
  };
}

export default function TeamValueYesterdayRecapView() {
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { memberList } = usePool();
  const { seriesByRound, teamsById, series } = usePlayoffData();
  const { games: todayGames } = useEspnTodayGames();
  const { games: yesterdayGames } = useEspnYesterdayGames();
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const {
    allAssignmentsByUser,
    syncedUserIds,
    hasLoadedInitialBoardState,
  } = useTeamValueBoard(playoffTeams);
  const currentUserId = profile?.id ?? null;
  const syncedUserIdSet = useMemo(() => new Set(syncedUserIds), [syncedUserIds]);
  const trustedMembers = useMemo(
    () => memberList.filter((member) => syncedUserIdSet.has(member.id)),
    [memberList, syncedUserIdSet]
  );
  const isTodayRecap = searchParams.get("day") === "today";
  const todayCompletedSeries = useMemo(() => {
    return todayGames
      .filter((game) => game.status === "completed")
      .map((game) => {
        const seriesItem = series.find((item) => samePair(item, game));
        return seriesItem ? { game, seriesItem } : null;
      })
      .filter(Boolean);
  }, [series, todayGames]);
  const recapSeries = useMemo(
    () => (isTodayRecap ? series : buildSeriesBeforeGames(series, todayCompletedSeries)),
    [isTodayRecap, series, todayCompletedSeries]
  );
  const recapGameSeries = useMemo(() => {
    const sourceGames = isTodayRecap ? todayGames : yesterdayGames;
    return sourceGames
      .filter((game) => game.status === "completed")
      .map((game) => {
        const seriesItem = recapSeries.find((item) => samePair(item, game));
        return seriesItem ? { game, seriesItem } : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.game.tipAt ?? 0) - new Date(b.game.tipAt ?? 0));
  }, [isTodayRecap, recapSeries, todayGames, yesterdayGames]);
  const previousSeries = useMemo(() => buildSeriesBeforeGames(recapSeries, recapGameSeries), [recapGameSeries, recapSeries]);
  const finalRecapSeries = useMemo(
    () => (isTodayRecap ? buildSeriesAfterGames(previousSeries, recapGameSeries) : recapSeries),
    [isTodayRecap, previousSeries, recapGameSeries, recapSeries]
  );
  const previousStandings = useMemo(
    () => buildTeamValueStandingsWithMonteCarlo(trustedMembers, allAssignmentsByUser, previousSeries, playoffTeams),
    [allAssignmentsByUser, playoffTeams, previousSeries, trustedMembers]
  );
  const currentStandings = useMemo(
    () => buildTeamValueStandingsWithMonteCarlo(trustedMembers, allAssignmentsByUser, finalRecapSeries, playoffTeams),
    [allAssignmentsByUser, finalRecapSeries, playoffTeams, trustedMembers]
  );
  const movementRows = useMemo(
    () => buildMovementRows(previousStandings, currentStandings, currentUserId),
    [currentStandings, currentUserId, previousStandings]
  );
  const narratives = useMemo(() => buildRecapNarratives(movementRows, currentUserId, isTodayRecap), [currentUserId, isTodayRecap, movementRows]);

  if (!hasLoadedInitialBoardState) {
    return (
      <div className="nba-shell">
        <section className="panel nba-reports-hero nba-report-detail-hero nba-briefing-desk-card">
          <span className="label">Yesterday's Recap</span>
          <h2>Loading yesterday's room movement</h2>
          <p className="subtle">We're syncing the boards first so the movement read does not flash through bad data.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="nba-shell">
      <a className="back-link" href="/dashboard">← Back to Dashboard</a>
      <div className="nba-dashboard-list">
        <section className="panel nba-reports-hero nba-report-detail-hero nba-briefing-desk-card nba-yesterday-hero-card">
          <div>
            <span className="label">{isTodayRecap ? "Game Recap" : "Yesterday's Recap"}</span>
            <h2>{isTodayRecap ? "How Today Is Moving the Room" : "How Yesterday Moved the Room"}</h2>
            <div className="nba-yesterday-hero-copy">
              <p>{narratives.user}</p>
              <p>{narratives.pool}</p>
            </div>
          </div>
          <details className="detail-card inset-card nba-report-game-details nba-briefing-deep-card nba-yesterday-movement-details">
            <summary>
              <span className="nba-report-game-details-label">
                <span className="nba-report-game-details-toggle" aria-hidden="true">+</span>
                <span className="micro-label">Movement Table</span>
              </span>
            </summary>
            <div className="nba-report-game-details-body">
              <div className="leaderboard-table nba-dashboard-leaderboard-table">
                <div className="leaderboard-head nba-dashboard-leaderboard-head" style={{ gridTemplateColumns: "1.2fr 0.55fr 0.55fr 0.55fr 0.55fr 0.6fr 0.7fr" }}>
                  <span>Player</span>
                  <span>Before</span>
                  <span>Now</span>
                  <span>Pts</span>
                  <span>Pts+</span>
                  <span>Win%</span>
                  <span>Win% +/-</span>
                </div>
                {movementRows.map((row) => (
                  <div className={`leaderboard-row nba-dashboard-leaderboard-row ${row.id === currentUserId ? "is-current" : ""}`} key={row.id} style={{ gridTemplateColumns: "1.2fr 0.55fr 0.55fr 0.55fr 0.55fr 0.6fr 0.7fr" }}>
                    <span>{row.name}</span>
                    <span>{ordinal(row.previousPlace)}</span>
                    <span>{ordinal(row.currentPlace)}</span>
                    <span>{row.points}</span>
                    <span>{row.pointsDelta}</span>
                    <span>{row.winProbability}%</span>
                    <span>{signedNumber(row.winDelta, " pts")}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </section>

        {recapGameSeries.length ? recapGameSeries.map((pair) => {
          const displayedSeriesItem = finalRecapSeries.find((seriesItem) => seriesItem.id === pair.seriesItem.id) ?? pair.seriesItem;
          const displayedPair = { ...pair, seriesItem: displayedSeriesItem };
          const scoreLabel = buildFinalScoreLabel(pair.game);
          const impactRows = buildGameImpactRows(displayedPair, trustedMembers, allAssignmentsByUser, finalRecapSeries, currentUserId, playoffTeams);
          const resultNarratives = buildGameResultNarratives(displayedPair, impactRows, currentUserId, allAssignmentsByUser, trustedMembers, playoffTeams);
          const matchingNextGame = todayGames.find((game) => game.status !== "completed" && samePair(pair.seriesItem, game)) ?? null;
          const nextPreview = buildNextGamePreview(displayedPair, trustedMembers, allAssignmentsByUser, finalRecapSeries, playoffTeams, currentUserId, matchingNextGame);

          return (
            <article className="detail-card inset-card nba-briefing-game-card nba-yesterday-game-card" key={pair.game.id} id={`game-recap-${pair.game.id}`}>
              <div className="nba-dashboard-on-tap-row nba-yesterday-final-row">
                <div className="nba-dashboard-on-tap-time">
                  <span>Final</span>
                </div>
                <div className="nba-dashboard-on-tap-copy">
                  <strong>{scoreLabel}</strong>
                  <span className="nba-dashboard-on-tap-live-status">Final</span>
                  <p>{formatSeriesStatus(displayedSeriesItem)}</p>
                </div>
              </div>
              <details className="detail-card inset-card nba-report-game-details nba-briefing-deep-card">
                <summary>
                  <span className="nba-report-game-details-label">
                    <span className="nba-report-game-details-toggle" aria-hidden="true">+</span>
                    <span className="micro-label">Result impact</span>
                  </span>
                </summary>
                <div className="nba-report-game-details-body">
                  <article className="detail-card inset-card nba-briefing-narrative-card">
                    <span className="micro-label">Your result read</span>
                    <p>{resultNarratives.user}</p>
                  </article>
                  <article className="detail-card inset-card nba-briefing-narrative-card">
                    <span className="micro-label">Pool result read</span>
                    <p>{resultNarratives.pool}</p>
                  </article>
                  <article className="detail-card inset-card nba-briefing-table-card">
                    <span className="micro-label">Who moved on this result</span>
                    <div className="leaderboard-table nba-dashboard-leaderboard-table">
                      <div className="leaderboard-head nba-dashboard-leaderboard-head" style={{ gridTemplateColumns: "1.2fr 0.7fr 0.7fr 1fr" }}>
                        <span>Player</span>
                        <span>Result pts</span>
                        <span>Place +/-</span>
                        <span>Read</span>
                      </div>
                      {impactRows.map((row) => (
                        <div className={`leaderboard-row nba-dashboard-leaderboard-row ${row.id === currentUserId ? "is-current" : ""}`} key={`${pair.game.id}-${row.id}`} style={{ gridTemplateColumns: "1.2fr 0.7fr 0.7fr 1fr" }}>
                          <span>{row.name}</span>
                          <span>{signedNumber(row.resultPoints)}</span>
                          <span>{signedNumber(row.placeDelta)}</span>
                          <span>{row.note}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="detail-card inset-card nba-briefing-narrative-card">
                    <span className="micro-label">Next Game Preview</span>
                    <strong>{nextPreview.title}</strong>
                    <p>{nextPreview.userText}</p>
                    <p>{nextPreview.poolText}</p>
                  </article>
                </div>
              </details>
            </article>
          );
        }) : (
          <article className="detail-card inset-card">
            <span className="micro-label">No finals found</span>
            <h3>No completed playoff games were found for {isTodayRecap ? "today" : "yesterday"}.</h3>
            <p className="subtle">If ESPN has not published the slate yet, this page will fill in once that scoreboard endpoint responds.</p>
          </article>
        )}
      </div>
    </div>
  );
}

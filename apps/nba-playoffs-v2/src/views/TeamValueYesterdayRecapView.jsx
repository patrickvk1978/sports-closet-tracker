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

function hashSeed(...parts) {
  return parts
    .filter(Boolean)
    .join("|")
    .split("")
    .reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

function chooseVariant(options, ...seedParts) {
  if (!options.length) return "";
  return options[hashSeed(...seedParts) % options.length];
}

function subjectPronoun(name) {
  return name === "You" ? "you" : name;
}

function subjectHas(name) {
  return name === "You" ? "have" : "has";
}

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
  const conferenceKey = String(seriesItem.conference ?? "").toLowerCase();
  const conference = conferenceKey === "west" ? "West" : conferenceKey === "league" ? "League" : "East";
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

function readPct(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSeriesModelGamePct(value) {
  const numeric = readPct(value);
  if (!Number.isFinite(numeric)) return null;
  const shrunk = 50 + (numeric - 50) * 0.65;
  return Math.max(20, Math.min(80, shrunk));
}

function resolveTeamGameMarketPct(seriesItem, teamId, referenceGame = null) {
  if (referenceGame) {
    if (teamId === referenceGame.homeTeamId) return readPct(referenceGame.marketHomeWinPct);
    if (teamId === referenceGame.awayTeamId) return readPct(referenceGame.marketAwayWinPct);
  }
  return null;
}

function resolveSeriesMarketPct(seriesItem, teamId) {
  if (!hasLiveSeriesMarket(seriesItem)) return null;
  const { homeId, awayId } = getSeriesTeamIds(seriesItem);
  if (teamId === homeId) return readPct(seriesItem.market?.homeWinPct);
  if (teamId === awayId) return readPct(seriesItem.market?.awayWinPct);
  return null;
}

function hasLiveSeriesMarket(seriesItem) {
  const sourceName = String(seriesItem?.market?.sourceName ?? "").toLowerCase();
  if (!sourceName) return false;
  return !(
    sourceName.includes("static") ||
    sourceName.includes("provisional") ||
    sourceName.includes("future_round_estimate") ||
    sourceName.includes("post_playin_estimate") ||
    sourceName.includes("completed_playin")
  );
}

function computeSeriesWinProbabilityFromGamePct(teamWins, opponentWins, teamGamePct) {
  if (!Number.isFinite(teamWins) || !Number.isFinite(opponentWins)) return null;
  if (teamWins >= 4) return 100;
  if (opponentWins >= 4) return 0;

  const probability = Math.max(0.05, Math.min(0.95, Number(teamGamePct ?? 50) / 100));
  const teamNeeded = 4 - teamWins;
  const opponentNeeded = 4 - opponentWins;
  let seriesWinProbability = 0;

  for (let remainingGames = teamNeeded; remainingGames <= teamNeeded + opponentNeeded - 1; remainingGames += 1) {
    const opponentWinsBeforeClincher = remainingGames - teamNeeded;
    if (opponentWinsBeforeClincher < 0 || opponentWinsBeforeClincher >= opponentNeeded) continue;
    seriesWinProbability +=
      combination(remainingGames - 1, teamNeeded - 1) *
      probability ** teamNeeded *
      (1 - probability) ** opponentWinsBeforeClincher;
  }

  return Math.max(1, Math.min(99, Math.round(seriesWinProbability * 100)));
}

function inferGameWinPctFromSeriesOdds(teamWins, opponentWins, targetSeriesPct) {
  const target = Number(targetSeriesPct);
  if (!Number.isFinite(target)) return null;
  const normalizedTarget = Math.max(0.01, Math.min(0.99, target / 100));
  let low = 0.05;
  let high = 0.95;

  for (let index = 0; index < 30; index += 1) {
    const mid = (low + high) / 2;
    const midSeriesPct = computeSeriesWinProbabilityFromGamePct(teamWins, opponentWins, mid * 100) / 100;
    if (midSeriesPct < normalizedTarget) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return normalizeSeriesModelGamePct(((low + high) / 2) * 100);
}

function probabilityToLogit(probabilityPct) {
  const probability = Math.max(0.01, Math.min(0.99, Number(probabilityPct ?? 50) / 100));
  return Math.log(probability / (1 - probability));
}

function logitToProbability(logit) {
  const odds = Math.exp(logit);
  return (odds / (1 + odds)) * 100;
}

function buildRemainingVenueSequence(homeWins, awayWins) {
  const schedule = [true, true, false, false, true, false, true];
  const nextGameIndex = Math.max(0, Math.min(schedule.length, homeWins + awayWins));
  return schedule.slice(nextGameIndex);
}

function computeSeriesWinProbabilityWithScheduleRaw(homeWins, awayWins, homeGameProbabilities, index = 0) {
  if (homeWins >= 4) return 1;
  if (awayWins >= 4) return 0;
  if (index >= homeGameProbabilities.length) return 0;

  const probability = Math.max(0.01, Math.min(0.99, Number(homeGameProbabilities[index] ?? 50) / 100));
  return (
    probability * computeSeriesWinProbabilityWithScheduleRaw(homeWins + 1, awayWins, homeGameProbabilities, index + 1) +
    (1 - probability) * computeSeriesWinProbabilityWithScheduleRaw(homeWins, awayWins + 1, homeGameProbabilities, index + 1)
  );
}

function computeSeriesWinProbabilityFromSchedule(seriesItem, homeWins, awayWins, referenceGame = null) {
  if (homeWins >= 4) return 100;
  if (awayWins >= 4) return 0;
  if (!referenceGame) return null;

  const { homeId } = getSeriesTeamIds(seriesItem);
  const marketSeriesHomePct =
    homeId === referenceGame.homeTeamId
      ? normalizeSeriesModelGamePct(referenceGame.marketHomeWinPct)
      : homeId === referenceGame.awayTeamId
        ? normalizeSeriesModelGamePct(referenceGame.marketAwayWinPct)
        : null;
  if (!Number.isFinite(marketSeriesHomePct)) return null;

  const seriesHomeIsCurrentVenueHome = homeId === referenceGame.homeTeamId;
  const homeCourtLogitEdge = 0.4;
  const currentLogit = probabilityToLogit(marketSeriesHomePct);
  const neutralLogit = currentLogit - (seriesHomeIsCurrentVenueHome ? homeCourtLogitEdge : -homeCourtLogitEdge);
  const remainingVenueSequence = buildRemainingVenueSequence(homeWins, awayWins);
  const homeGameProbabilities = remainingVenueSequence.map((seriesHomeVenue) =>
    logitToProbability(neutralLogit + (seriesHomeVenue ? homeCourtLogitEdge : -homeCourtLogitEdge))
  );

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(computeSeriesWinProbabilityWithScheduleRaw(homeWins, awayWins, homeGameProbabilities) * 100)
    )
  );
}

function getSeriesChance(seriesItem, teamId, referenceGame = null) {
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

  if (!referenceGame) {
    return hasLiveSeriesMarket(seriesItem) ? resolveSeriesMarketPct(seriesItem, teamId) : null;
  }

  const referenceHomePct = readPct(referenceGame.marketHomeWinPct);
  const referenceAwayPct = readPct(referenceGame.marketAwayWinPct);
  const homeGamePct =
    homeId === referenceGame.homeTeamId
      ? normalizeSeriesModelGamePct(referenceHomePct)
      : homeId === referenceGame.awayTeamId
        ? normalizeSeriesModelGamePct(referenceAwayPct)
        : null;
  if (!Number.isFinite(homeGamePct)) return hasLiveSeriesMarket(seriesItem) ? resolveSeriesMarketPct(seriesItem, teamId) : null;

  const scheduledHomeSeriesPct = computeSeriesWinProbabilityFromSchedule(seriesItem, wins.home, wins.away, referenceGame);
  if (!Number.isFinite(scheduledHomeSeriesPct)) return hasLiveSeriesMarket(seriesItem) ? resolveSeriesMarketPct(seriesItem, teamId) : null;

  const homeIfHomeWinsPct = computeSeriesWinProbabilityFromSchedule(seriesItem, Math.min(wins.home + 1, 4), wins.away, referenceGame);
  const homeIfAwayWinsPct = computeSeriesWinProbabilityFromSchedule(seriesItem, wins.home, Math.min(wins.away + 1, 4), referenceGame);
  if (!Number.isFinite(homeIfHomeWinsPct) || !Number.isFinite(homeIfAwayWinsPct)) {
    return teamId === homeId ? scheduledHomeSeriesPct : Math.max(1, Math.min(99, Math.round(100 - scheduledHomeSeriesPct)));
  }

  const currentHomePct =
    (homeGamePct / 100) * homeIfHomeWinsPct +
    ((100 - homeGamePct) / 100) * homeIfAwayWinsPct;
  return teamId === homeId
    ? Math.max(1, Math.min(99, Math.round(currentHomePct)))
    : Math.max(1, Math.min(99, Math.round(100 - currentHomePct)));
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

function buildRecapNarrativeState(pair, impactRows, userRow, userWinnerValue, averagePoints) {
  const totalGames = Number(pair.seriesItem.wins?.home ?? 0) + Number(pair.seriesItem.wins?.away ?? 0);
  const winnerId = getGameWinnerId(pair.game);
  const { homeId, awayId } = getSeriesTeamIds(pair.seriesItem);
  const winnerWins = winnerId === homeId
    ? Number(pair.seriesItem.wins?.home ?? 0)
    : winnerId === awayId
      ? Number(pair.seriesItem.wins?.away ?? 0)
      : 0;
  const loserWins = winnerId === homeId
    ? Number(pair.seriesItem.wins?.away ?? 0)
    : winnerId === awayId
      ? Number(pair.seriesItem.wins?.home ?? 0)
      : 0;

  const stage = winnerWins >= 4
    ? "closed"
    : winnerWins === 3 && loserWins <= 1
      ? "door-slam"
      : winnerWins === 3 && loserWins === 2
        ? "brink"
        : totalGames >= 4
          ? "hinge"
          : totalGames >= 2
            ? "shape"
            : "opening";

  const roomHeat = averagePoints >= 12
    ? "heavy"
    : averagePoints >= 7
      ? "meaningful"
      : averagePoints >= 3
        ? "moderate"
        : "quiet";

  const userEquityTier = Math.abs(Number(userRow?.placeDelta ?? 0)) >= 2 || Number(userWinnerValue ?? 0) >= 14
    ? "major"
    : Math.abs(Number(userRow?.placeDelta ?? 0)) === 1 || Number(userWinnerValue ?? 0) >= 8
      ? "material"
      : Number(userWinnerValue ?? 0) > 0
        ? "light"
        : "indirect";

  const stageSentence = stage === "closed"
    ? "This one did more than move a nightly scoreboard; it locked a full series result onto the board."
    : stage === "door-slam"
      ? "This result put one side right on top of the series, which is where the future-value part starts to matter more."
      : stage === "brink"
        ? "This result did not end the series, but it pushed the pressure hard onto the next tip."
        : stage === "hinge"
          ? "This is the part of a series where a single result starts bending both the room and the future path."
          : stage === "shape"
            ? "It is still early enough that one game does not decide everything, but late enough that the room starts taking shape around it."
            : "This was still an opening read more than a definitive turn, so the value sits as much in what it set up as in what it finished.";

  const roomSentence = roomHeat === "heavy"
    ? "The room felt this one in a real way."
    : roomHeat === "meaningful"
      ? "This was a meaningful room mover, not just a quiet result on the ticker."
      : roomHeat === "moderate"
        ? "This landed as a moderate room nudge more than a full reshuffle."
        : "This result was lighter at the pool level, with more texture than chaos.";

  return {
    stage,
    roomHeat,
    userEquityTier,
    stageSentence,
    roomSentence,
  };
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
  const narrativeState = buildRecapNarrativeState(pair, impactRows, userRow, userWinnerValue, averagePoints);
  const futureValueSentence = userHasUniqueTopWinner
    ? `You are the only synced board with ${winnerName} in the top slot, so the bigger value is not just yesterday's points; it is that every ${winnerShort} win protects a long-term advantage only you currently have.`
    : userWinnerValue >= 13
      ? `${winnerName} is one of your premium assets, so this win matters beyond the standings line: it keeps a high-value path alive for later rounds.`
      : userWinnerValue > 0
        ? `${winnerName} is not your biggest asset, but the win still keeps useful future value in play if this series keeps bending your way.`
        : `The long-term value is indirect for you: ${winnerName} winning helps the boards that invested there, while your path depends on whether the other side can still create separation later.`;

  const userNarrative = userRow
    ? userRow.resultPoints > 0
      ? chooseVariant([
        `${winnerName} gave you ${userRow.resultPoints} points from this result. ${userRow.placeDelta > 0 ? `That was enough to move you up ${userRow.placeDelta} spot${userRow.placeDelta === 1 ? "" : "s"}.` : userRow.placeDelta < 0 ? `Even with those points, other boards got more from the same result and you slid ${Math.abs(userRow.placeDelta)} spot${Math.abs(userRow.placeDelta) === 1 ? "" : "s"}.` : "It did not change your place, but it did keep your board moving with the right side of the series."} ${narrativeState.stageSentence} ${futureValueSentence}`,
        `You banked ${userRow.resultPoints} points when ${winnerShort} got home. ${userRow.placeDelta > 0 ? `That lifted you ${userRow.placeDelta} place${userRow.placeDelta === 1 ? "" : "s"} in the room.` : userRow.placeDelta < 0 ? `The catch is that the field collected even more, so you still dropped ${Math.abs(userRow.placeDelta)} place${Math.abs(userRow.placeDelta) === 1 ? "" : "s"}.` : "The standings line barely moved for you, but the asset still paid off."} ${narrativeState.stage === "closed" ? "Because the series result is now locked in, those points carry full weight immediately." : narrativeState.stageSentence} ${futureValueSentence}`,
        `${winnerName} came through for your board to the tune of ${userRow.resultPoints} points. ${userRow.placeDelta > 0 ? `It translated directly into a ${userRow.placeDelta}-spot climb.` : userRow.placeDelta < 0 ? `It still was not enough to keep you from giving back ${Math.abs(userRow.placeDelta)} place${Math.abs(userRow.placeDelta) === 1 ? "" : "s"} to boards that were even heavier there.` : "Your place stayed put, which tells you this result mattered more for pace than for immediate separation."} ${narrativeState.userEquityTier === "major" ? "For your board, this was one of the higher-leverage results on the slate." : narrativeState.stageSentence} ${futureValueSentence}`,
      ], pair.game.id, currentUserId, "recap-user-positive", narrativeState.stage, narrativeState.userEquityTier)
      : chooseVariant([
        `${winnerName} did not hand you direct points, so this result was more about room equity than scoreboard gain. ${userRow.placeDelta < 0 ? `You lost ${Math.abs(userRow.placeDelta)} spot${Math.abs(userRow.placeDelta) === 1 ? "" : "s"} because other boards had more tied to the winner.` : userRow.placeDelta > 0 ? `You still moved up ${userRow.placeDelta} spot${userRow.placeDelta === 1 ? "" : "s"}, which means the result clipped the boards around you even more than it clipped yours.` : "Your place held, which means the damage stayed contained."} ${narrativeState.stageSentence} ${futureValueSentence}`,
        `There were no direct result points for you here, so the cleaner read is about who absorbed the outcome best. ${userRow.placeDelta < 0 ? `Nearby boards converted ${winnerShort} into enough leverage to push you back ${Math.abs(userRow.placeDelta)} place${Math.abs(userRow.placeDelta) === 1 ? "" : "s"}.` : userRow.placeDelta > 0 ? `You quietly gained ${userRow.placeDelta} place${userRow.placeDelta === 1 ? "" : "s"} anyway, which tells you the loss landed harder on the competition than on you.` : "The board stayed mostly level for you, which is a decent defensive result when you had no direct points on the winner."} ${futureValueSentence}`,
        `${winnerName} was not sitting in a direct scoring slot for you. That made this one a leverage read first and a standings read second. ${userRow.placeDelta < 0 ? `The leverage broke against you, costing ${Math.abs(userRow.placeDelta)} place${Math.abs(userRow.placeDelta) === 1 ? "" : "s"}.` : userRow.placeDelta > 0 ? `The indirect impact still helped you climb ${userRow.placeDelta} place${userRow.placeDelta === 1 ? "" : "s"}.` : "The indirect room movement was mild enough that your place stayed unchanged."} ${narrativeState.stageSentence} ${futureValueSentence}`,
      ], pair.game.id, currentUserId, "recap-user-zero", narrativeState.stage, narrativeState.userEquityTier)
    : `This result is readable at the pool level, but your board is not available in the synced movement rows.`;

  const poolNarrative = topPoints
    ? chooseVariant([
      `${winnerAbbr}-${loserAbbr} moved the room through ${winnerAbbr} exposure. ${topPoints.name} banked the biggest direct gain at ${topPoints.resultPoints} points, while ${climbers.length ? `${climbers.length} board${climbers.length === 1 ? "" : "s"} moved up the standings` : "the standings order mostly held"}. The average visible board gained ${averagePoints} points here. ${narrativeState.roomSentence}${harmed.length ? ` ${harmed.length} board${harmed.length === 1 ? "" : "s"} gave back position on the same final.` : ""}`,
      `The room read on ${winnerAbbr}-${loserAbbr} was straightforward: boards carrying ${winnerAbbr} got paid. ${topPoints.name} saw the biggest single bump at ${topPoints.resultPoints} points, and ${climbers.length ? `${climbers.length} entry${climbers.length === 1 ? "" : "ies"} turned that into upward movement` : "the main order did not budge much"}. At ${averagePoints} points per visible board on average, this landed as ${narrativeState.roomHeat === "heavy" ? "one of the real movers on the slate" : narrativeState.roomHeat === "meaningful" ? "a meaningful room shift" : narrativeState.roomHeat === "moderate" ? "a moderate board shaper" : "a lighter result with selective fallout"}.`,
      `${winnerAbbr} exposure was the story of this final. ${topPoints.name} took the biggest direct step at ${topPoints.resultPoints} points, while ${harmed.length ? `${harmed.length} board${harmed.length === 1 ? "" : "s"} lost standing ground` : "very few boards were meaningfully knocked back"}. ${narrativeState.roomSentence} ${narrativeState.stageSentence}`,
    ], pair.game.id, topPoints.id, "recap-pool", narrativeState.stage, narrativeState.roomHeat)
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
      ? chooseVariant([
        `With the victory, ${teamShortName(winnerTeam, winnerAbbrForTeam(winnerId, homeId, homeAbbr, awayAbbr))} now has a ${formatPercentPhrase(seriesChance)} chance to take the series. The next game looks fairly neutral for your pool equity, so the better read is simply which boards are most exposed when the series turns back on.`,
        `${teamShortName(winnerTeam, winnerAbbrForTeam(winnerId, homeId, homeAbbr, awayAbbr))} now sit at a ${formatPercentPhrase(seriesChance)} series outlook after the win. For your board, the next game still reads closer to room exposure than to a sharp personal swing.`,
        `The win pushes ${teamShortName(winnerTeam, winnerAbbrForTeam(winnerId, homeId, homeAbbr, awayAbbr))} to a ${formatPercentPhrase(seriesChance)} chance to finish the series. From your angle, the next turn looks more watchful than decisive unless the room starts clustering harder on one side.`,
      ], pair.seriesItem.id, currentUserId, "next-preview-neutral")
      : chooseVariant([
        `With the victory, ${teamShortName(winnerTeam, winnerAbbrForTeam(winnerId, homeId, homeAbbr, awayAbbr))} now has a ${formatPercentPhrase(seriesChance)} chance to take the series. ${nextGamePct != null ? `The early ESPN read gives ${teamShortName(userSideTeam, userSide)} a ${nextGamePct}% chance in the next game.` : `The next turn still looks more like an exposure game than a market game for your board.`} A ${userSide} result would have a ${userImpactLabel} impact on your pool path, moving you about ${Math.abs(userDelta).toFixed(1)} win-probability points compared with ${otherSide}.`,
        `${teamShortName(winnerTeam, winnerAbbrForTeam(winnerId, homeId, homeAbbr, awayAbbr))} now carry a ${formatPercentPhrase(seriesChance)} chance to close the series after this result. ${nextGamePct != null ? `${teamShortName(userSideTeam, userSide)} open the next game at ${nextGamePct}% on the ESPN read.` : `The next game still looks more exposure-driven than market-driven for your board.`} If ${userSide} take the next one, your pool path gets a ${userImpactLabel} bump of roughly ${Math.abs(userDelta).toFixed(1)} win-probability points compared with ${otherSide}.`,
        `The result leaves ${teamShortName(winnerTeam, winnerAbbrForTeam(winnerId, homeId, homeAbbr, awayAbbr))} at a ${formatPercentPhrase(seriesChance)} chance to win the series. ${nextGamePct != null ? `ESPN's early read makes ${teamShortName(userSideTeam, userSide)} a ${nextGamePct}% side in the next game.` : `For now, the next read is still more about who is exposed than about a fresh market edge.`} For your board, a ${userSide} win next time would shift the pool picture by about ${Math.abs(userDelta).toFixed(1)} win-probability points versus ${otherSide}.`,
      ], pair.seriesItem.id, currentUserId, "next-preview-leaning"),
    poolText: bestRows.length
      ? chooseVariant([
        `${subjectPronoun(topName)} would see the single biggest bump if ${topRow.side} wins, with a ${topRow.swing.toFixed(1)}-point swing. The broader pressure cluster is ${bestRows.map((row) => `${row.name} toward ${row.side}`).join(" · ")}, which is the lane tomorrow's Briefing should unpack.`,
        `The strongest room reaction belongs to ${subjectPronoun(topName)}, who would gain ${topRow.swing.toFixed(1)} points of pool equity if ${topRow.side} land. Behind that, the live pressure map is ${bestRows.map((row) => `${row.name} on ${row.side}`).join(" · ")}.`,
        `At the pool level, ${subjectPronoun(topName)} ${subjectHas(topName)} the cleanest next-game upside on ${topRow.side}, worth ${topRow.swing.toFixed(1)} points. The broader room shape is ${bestRows.map((row) => `${row.name} toward ${row.side}`).join(" · ")}, which is where tomorrow's briefing should start.`,
      ], pair.seriesItem.id, currentUserId, "next-preview-pool")
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
      ? chooseVariant([
        `You ${isTodayRecap ? "are sitting" : "finished the day"} ${ordinal(userRow.currentPlace)}, with ${signedNumber(userRow.pointsDelta, " pts")} from ${dayLabel}'s completed games and ${signedNumber(userRow.winDelta, " pts")} of pool-win movement. The simpler read: ${finishedLabel} ${userRow.placeDelta > 0 ? "moved you up the board" : userRow.placeDelta < 0 ? "cost you position" : "mostly held your position"}, though the simulation shift still says more than the raw place line does.`,
        `${isTodayRecap ? "Right now you sit" : "You closed the day"} ${ordinal(userRow.currentPlace)}, after ${signedNumber(userRow.pointsDelta, " pts")} from ${dayLabel}'s finals and ${signedNumber(userRow.winDelta, " pts")} of pool-equity movement. In plain terms, ${finishedLabel} ${userRow.placeDelta > 0 ? "helped you climb" : userRow.placeDelta < 0 ? "nudged you backward" : "left your spot mostly unchanged"}, even if the deeper simulation signal matters more than the raw standings line.`,
        `${isTodayRecap ? "At the moment you are" : "You ended the slate"} ${ordinal(userRow.currentPlace)}, with ${signedNumber(userRow.pointsDelta, " pts")} on the board and ${signedNumber(userRow.winDelta, " pts")} of win-probability movement. The scoreboard view says ${finishedLabel} ${userRow.placeDelta > 0 ? "was a gain" : userRow.placeDelta < 0 ? "cost you ground" : "was mostly steady"}; the simulation view explains whether that movement really changed your outlook.`,
      ], currentUserId, dayLabel, "recap-user")
      : "Your board is not synced into this pool read yet, so the recap can summarize the room but cannot give a reliable personal movement read.",
    pool: biggestClimber
      ? chooseVariant([
        `${biggestClimber.name} had the clearest standings move, while ${biggestWinProb?.name ?? biggestClimber.name} gained the most pool equity. The room shifted less like a simple leaderboard shuffle and more like a leverage map: the same final scores helped some boards bank points while opening or closing future paths for others.`,
        `${biggestClimber.name} made the clearest visible climb, and ${biggestWinProb?.name ?? biggestClimber.name} picked up the biggest win-probability bump. The broader room story was not just points; it was which boards turned those finals into future leverage.`,
        `The cleanest room mover was ${biggestClimber.name}, while ${biggestWinProb?.name ?? biggestClimber.name} saw the strongest equity gain. More than anything, ${dayLabel}'s results reshaped the pool unevenly: some entries banked safe points, others quietly improved their long-range paths.`,
      ], biggestClimber.id, biggestWinProb?.id, dayLabel, "recap-pool")
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

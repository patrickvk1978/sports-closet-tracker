import { TITLE_ODDS_INPUTS } from "../data/titleOdds";
import { buildTeamValueStandings } from "./teamValueStandings";
import { getSeriesWinPoints } from "./teamValueGame";

const SAMPLE_SLOT_VALUE = 10;
const SIMULATION_ITERATIONS = 2400;

export function americanOddsToImpliedPct(american) {
  const normalized = Number(american);
  if (!Number.isFinite(normalized) || normalized === 0) return 0;
  if (normalized > 0) return Number(((100 / (normalized + 100)) * 100).toFixed(1));
  return Number((((-normalized) / ((-normalized) + 100)) * 100).toFixed(1));
}

export function formatAmericanOdds(american) {
  const normalized = Number(american);
  if (!Number.isFinite(normalized) || normalized === 0) return "N/A";
  return normalized > 0 ? `+${normalized}` : `${normalized}`;
}

export function getRoundOneTeamsFromData(seriesByRound, teamsById) {
  const roundOneSeries = seriesByRound.round_1 ?? [];
  const teamIds = Array.from(new Set(roundOneSeries.flatMap((seriesItem) => [seriesItem.homeTeamId, seriesItem.awayTeamId])));

  return teamIds
    .map((teamId) => {
      const team = teamsById[teamId];
      const sourceSeries = roundOneSeries.find(
        (seriesItem) => seriesItem.homeTeamId === teamId || seriesItem.awayTeamId === teamId
      );
      const marketLean =
        sourceSeries?.homeTeamId === teamId
          ? sourceSeries?.market?.homeWinPct
          : sourceSeries?.market?.awayWinPct;
      const modelLean =
        sourceSeries?.homeTeamId === teamId
          ? sourceSeries?.model?.homeWinPct
          : sourceSeries?.model?.awayWinPct;
      const titleOdds = TITLE_ODDS_INPUTS[teamId]?.american ?? null;
      const titlePct = americanOddsToImpliedPct(titleOdds);

      return {
        ...team,
        marketLean: marketLean ?? 50,
        modelLean: modelLean ?? marketLean ?? 50,
        titleOdds,
        titlePct,
      };
    })
    .filter(Boolean);
}

export function estimateTeamValueWinProbability(member, allStandings) {
  const totalRemaining = allStandings.reduce((sum, entry) => sum + entry.liveValueRemaining, 0);
  const currentLeadValue = allStandings[0]?.summary.totalPoints ?? 0;
  const scoreShare = currentLeadValue ? member.summary.totalPoints / currentLeadValue : 0;
  const remainingShare = totalRemaining ? member.liveValueRemaining / totalRemaining : 0;
  const bestAssetShare = (member.bestRemainingAsset?.value ?? 0) / 16;
  const raw = scoreShare * 0.45 + remainingShare * 0.4 + bestAssetShare * 0.15;
  const totalRaw = allStandings.reduce((sum, entry) => {
    const entryScoreShare = currentLeadValue ? entry.summary.totalPoints / currentLeadValue : 0;
    const entryRemainingShare = totalRemaining ? entry.liveValueRemaining / totalRemaining : 0;
    const entryBestAssetShare = (entry.bestRemainingAsset?.value ?? 0) / 16;
    return sum + (entryScoreShare * 0.45 + entryRemainingShare * 0.4 + entryBestAssetShare * 0.15);
  }, 0);
  return totalRaw ? Number(((raw / totalRaw) * 100).toFixed(1)) : 0;
}

export function buildTeamValueStandingsWithOdds(memberList, allAssignmentsByUser, series) {
  const base = buildTeamValueStandings(memberList, allAssignmentsByUser, series);
  const seeded = base.map((member) => ({ ...member, winProbability: 0 }));
  return seeded.map((member) => ({
    ...member,
    winProbability: estimateTeamValueWinProbability(member, seeded),
  }));
}

export function buildTeamExposureRows(teams, allAssignmentsByUser, currentUserId) {
  return teams
    .map((team) => {
      const assignedValues = Object.entries(allAssignmentsByUser ?? {})
        .map(([, assignments]) => Number(assignments?.[team.id] ?? 0))
        .filter((value) => value > 0);
      const avgValue = assignedValues.length
        ? Number((assignedValues.reduce((sum, value) => sum + value, 0) / assignedValues.length).toFixed(1))
        : 0;

      return {
        ...team,
        avgValue,
        yourValue: Number(allAssignmentsByUser?.[currentUserId]?.[team.id] ?? 0),
        leverage: Number((Number(allAssignmentsByUser?.[currentUserId]?.[team.id] ?? 0) - avgValue).toFixed(1)),
      };
    })
    .sort((a, b) => b.yourValue - a.yourValue || b.avgValue - a.avgValue || a.seed - b.seed);
}

export function buildSeriesLeverageRows(seriesByRound, allAssignmentsByUser, currentUserId) {
  const roundOneSeries = seriesByRound.round_1 ?? [];
  return roundOneSeries
    .map((seriesItem) => {
      const homeValue = Number(allAssignmentsByUser?.[currentUserId]?.[seriesItem.homeTeam.id] ?? 0);
      const awayValue = Number(allAssignmentsByUser?.[currentUserId]?.[seriesItem.awayTeam.id] ?? 0);
      const preferredTeam = homeValue >= awayValue ? seriesItem.homeTeam : seriesItem.awayTeam;
      const otherTeam = homeValue >= awayValue ? seriesItem.awayTeam : seriesItem.homeTeam;
      const gap = Math.abs(homeValue - awayValue);

      const roomHomeAvg = averageAssignment(allAssignmentsByUser, seriesItem.homeTeam.id);
      const roomAwayAvg = averageAssignment(allAssignmentsByUser, seriesItem.awayTeam.id);
      const roomPreferred = roomHomeAvg >= roomAwayAvg ? seriesItem.homeTeam : seriesItem.awayTeam;

      return {
        id: seriesItem.id,
        matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
        title:
          gap === 0
            ? `${seriesItem.homeTeam.abbreviation}-${seriesItem.awayTeam.abbreviation} is balanced on your board`
            : `${preferredTeam.abbreviation} is your stronger side here`,
        body:
          gap === 0
            ? "You priced both sides similarly, so this series matters more for general bracket shape than for a single concentrated asset."
            : roomPreferred.id === preferredTeam.id
              ? `You and the room both lean ${preferredTeam.abbreviation}, but you have ${gap} more points tied to that side than the opposite team.`
              : `You are leaning ${preferredTeam.abbreviation} while the room's average board is stronger on ${roomPreferred.abbreviation}. That makes this a live leverage series.`,
        gap,
        preferredTeam: preferredTeam.abbreviation,
      };
    })
    .sort((a, b) => b.gap - a.gap);
}

function averageAssignment(allAssignmentsByUser, teamId) {
  const values = Object.values(allAssignmentsByUser ?? {})
    .map((assignments) => Number(assignments?.[teamId] ?? 0))
    .filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function makeSeededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildTeamStrengthMap(teamEntries) {
  return Object.fromEntries(
    teamEntries.map((team) => {
      const titleComponent = Math.max((team.titlePct ?? 0) / 100, 0.002);
      const marketComponent = Math.max((team.marketLean ?? 50) / 100, 0.35);
      const seedComponent = Math.max(0.16, (17 - (team.seed ?? 16)) / 16);
      const strength = titleComponent * 0.68 + marketComponent * 0.22 + seedComponent * 0.1;
      return [team.id, strength];
    })
  );
}

function buildBracket(roundOneSeries) {
  const byId = Object.fromEntries(roundOneSeries.map((seriesItem) => [seriesItem.id, seriesItem]));
  return {
    eastSemis: [
      ["east-r1-1", "east-r1-3", "semifinals"],
      ["east-r1-2", "east-r1-4", "semifinals"],
    ],
    westSemis: [
      ["west-r1-1", "west-r1-4", "semifinals"],
      ["west-r1-2", "west-r1-3", "semifinals"],
    ],
    finals: [
      ["east-semi-1", "east-semi-2", "finals"],
      ["west-semi-1", "west-semi-2", "finals"],
    ],
    nbaFinals: [["east-finals", "west-finals", "nba_finals"]],
    roundOneById: byId,
  };
}

function getFavoriteStrengthDistribution(favoriteProbability) {
  if (favoriteProbability >= 0.78) return [0.34, 0.29, 0.22, 0.15];
  if (favoriteProbability >= 0.68) return [0.26, 0.28, 0.27, 0.19];
  if (favoriteProbability >= 0.58) return [0.18, 0.24, 0.30, 0.28];
  return [0.13, 0.19, 0.29, 0.39];
}

function sampleSeriesGames(winProbability, rng) {
  const favoriteProbability = Math.max(winProbability, 1 - winProbability);
  const [p4, p5, p6, p7] = getFavoriteStrengthDistribution(favoriteProbability);
  const roll = rng();
  if (roll < p4) return 4;
  if (roll < p4 + p5) return 5;
  if (roll < p4 + p5 + p6) return 6;
  return 7;
}

function simulateSeries(homeId, awayId, roundKey, strengthByTeam, rng, presetWinPct) {
  const inferredHomeWin =
    presetWinPct ??
    ((strengthByTeam[homeId] ?? 0.1) / ((strengthByTeam[homeId] ?? 0.1) + (strengthByTeam[awayId] ?? 0.1))) * 100;
  const homeWinPct = Math.min(Math.max(inferredHomeWin, 5), 95);
  const homeWon = rng() < homeWinPct / 100;
  const games = sampleSeriesGames(homeWinPct / 100, rng);

  return {
    winnerId: homeWon ? homeId : awayId,
    games,
    points: getSeriesWinPoints(SAMPLE_SLOT_VALUE, roundKey, games),
  };
}

function simulateTeamValueTournament(teamEntries, roundOneSeries) {
  const strengthByTeam = buildTeamStrengthMap(teamEntries);
  const totals = Object.fromEntries(teamEntries.map((team) => [team.id, { points: 0, titles: 0 }]));
  const bracket = buildBracket(roundOneSeries);
  const rng = makeSeededRng(20260413);

  for (let iteration = 0; iteration < SIMULATION_ITERATIONS; iteration += 1) {
    const roundWinners = {};

    for (const seriesItem of roundOneSeries) {
      const presetWinPct = seriesItem.market?.homeWinPct ?? null;
      const result = simulateSeries(
        seriesItem.homeTeam.id,
        seriesItem.awayTeam.id,
        "round_1",
        strengthByTeam,
        rng,
        presetWinPct
      );
      totals[result.winnerId].points += result.points;
      roundWinners[seriesItem.id] = result.winnerId;
    }

    bracket.eastSemis.forEach(([leftId, rightId], index) => {
      const result = simulateSeries(roundWinners[leftId], roundWinners[rightId], "semifinals", strengthByTeam, rng);
      totals[result.winnerId].points += result.points;
      roundWinners[`east-semi-${index + 1}`] = result.winnerId;
    });

    bracket.westSemis.forEach(([leftId, rightId], index) => {
      const result = simulateSeries(roundWinners[leftId], roundWinners[rightId], "semifinals", strengthByTeam, rng);
      totals[result.winnerId].points += result.points;
      roundWinners[`west-semi-${index + 1}`] = result.winnerId;
    });

    bracket.finals.forEach(([leftId, rightId], index) => {
      const result = simulateSeries(roundWinners[leftId], roundWinners[rightId], "finals", strengthByTeam, rng);
      totals[result.winnerId].points += result.points;
      roundWinners[index === 0 ? "east-finals" : "west-finals"] = result.winnerId;
    });

    const finalsResult = simulateSeries(
      roundWinners["east-finals"],
      roundWinners["west-finals"],
      "nba_finals",
      strengthByTeam,
      rng
    );
    totals[finalsResult.winnerId].points += finalsResult.points;
    totals[finalsResult.winnerId].titles += 1;
  }

  return Object.fromEntries(
    Object.entries(totals).map(([teamId, totalsForTeam]) => [
      teamId,
      {
        expectedPoints: Number((totalsForTeam.points / SIMULATION_ITERATIONS).toFixed(1)),
        simulatedTitlePct: Number(((totalsForTeam.titles / SIMULATION_ITERATIONS) * 100).toFixed(1)),
      },
    ])
  );
}

export function buildTeamSelectionRows(teamEntries, seriesByRound, allAssignmentsByUser, currentUserId, poolSize) {
  const roundOneSeries = seriesByRound.round_1 ?? [];
  const simulationByTeam = simulateTeamValueTournament(teamEntries, roundOneSeries);
  const rankedByExpectedPoints = [...teamEntries]
    .sort((a, b) => {
      const aPoints = simulationByTeam[a.id]?.expectedPoints ?? 0;
      const bPoints = simulationByTeam[b.id]?.expectedPoints ?? 0;
      return bPoints - aPoints || (b.titlePct ?? 0) - (a.titlePct ?? 0) || a.seed - b.seed;
    })
    .map((team, index) => [team.id, 16 - index]);
  const fairValueByTeam = Object.fromEntries(rankedByExpectedPoints);
  const leverageScale = Math.min(0.14, 0.05 + Math.max((poolSize ?? 0) - 4, 0) * 0.008);

  return teamEntries
    .map((team) => {
      const fairValue = fairValueByTeam[team.id] ?? 0;
      const expectedPoints = simulationByTeam[team.id]?.expectedPoints ?? 0;
      const titlePct = team.titlePct ?? 0;
      const midTierBonus = titlePct >= 2 && titlePct <= 14 ? leverageScale * 0.65 : 0;
      const chalkPenalty = titlePct >= 12 ? leverageScale * 0.45 : 0;
      const survivabilityBonus = Math.max((team.marketLean ?? 50) - 50, 0) / 100 * 0.16;
      const slotBonus = Math.max(fairValue - 8, 0) * 0.01;
      const poolEv = Number((expectedPoints * (1 + midTierBonus + survivabilityBonus + slotBonus - chalkPenalty)).toFixed(1));

      return {
        ...team,
        expectedPoints,
        poolEv,
        fairValue,
        titleOddsDisplay: formatAmericanOdds(team.titleOdds),
        titleOddsPct: team.titlePct ?? 0,
      };
    })
    .sort((a, b) => b.expectedPoints - a.expectedPoints || b.poolEv - a.poolEv || a.seed - b.seed);
}

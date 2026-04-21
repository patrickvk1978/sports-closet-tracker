export const TEAM_VALUE_SLOTS = Array.from({ length: 16 }, (_, index) => 16 - index);
export const TEAM_VALUE_DISPLAY_RANKS = Array.from({ length: 16 }, (_, index) => index + 1);

export const ROUND_BONUS = {
  round_1: 0,
  semifinals: 4,
  finals: 8,
  nba_finals: 12,
};

export const ROUND_LABELS = {
  round_1: "Round 1",
  semifinals: "Conference Semifinals",
  finals: "Conference Finals",
  nba_finals: "NBA Finals",
};

export const SERIES_LENGTH_BONUS = {
  4: 3,
  5: 2,
  6: 1,
  7: 0,
};

const WIN_STEP_WEIGHTS = [1, 2, 3, 6];

export function getSeriesLength(series) {
  if (!series?.wins) return null;
  const total = Number(series.wins.home ?? 0) + Number(series.wins.away ?? 0);
  return total >= 4 && total <= 7 ? total : null;
}

export function buildWinStepPoints(teamValue) {
  const normalizedTeamValue = Math.max(0, Math.round(Number(teamValue) || 0));
  if (normalizedTeamValue <= 0) return [0, 0, 0, 0];

  const totalWeight = WIN_STEP_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  const rawPoints = WIN_STEP_WEIGHTS.map((weight) => (normalizedTeamValue * weight) / totalWeight);
  const points = rawPoints.map((value) => Math.floor(value));
  let remainder = normalizedTeamValue - points.reduce((sum, value) => sum + value, 0);

  const priorityOrder = rawPoints
    .map((value, index) => ({ index, fraction: value - points[index] }))
    .sort((a, b) => b.fraction - a.fraction || b.index - a.index);

  for (let index = 0; index < priorityOrder.length && remainder > 0; index += 1) {
    points[priorityOrder[index].index] += 1;
    remainder -= 1;
  }

  return points;
}

export function getWinStepPoints(teamValue, winNumber) {
  const progression = buildWinStepPoints(teamValue);
  return progression[Math.max(0, Number(winNumber) - 1)] ?? 0;
}

export function getClinchingBonus(roundKey, games) {
  return (ROUND_BONUS[roundKey] ?? 0) + (SERIES_LENGTH_BONUS[games] ?? 0);
}

export function getTeamPointsForSeriesProgress(teamValue, wins, roundKey, clinchedInGames = null) {
  const normalizedWins = Math.max(0, Math.min(4, Math.round(Number(wins) || 0)));
  if (normalizedWins <= 0) return 0;

  const progression = buildWinStepPoints(teamValue);
  const basePoints = progression.slice(0, normalizedWins).reduce((sum, value) => sum + value, 0);
  const clinchingBonus = clinchedInGames ? getClinchingBonus(roundKey, clinchedInGames) : 0;
  return basePoints + clinchingBonus;
}

export function getSeriesWinPoints(teamValue, roundKey, games) {
  return getTeamPointsForSeriesProgress(teamValue, 4, roundKey, games);
}

export function buildScoringTable(sampleTeamValue = 16) {
  return Object.keys(ROUND_BONUS).map((roundKey) => ({
    roundKey,
    label: ROUND_LABELS[roundKey] ?? roundKey,
    perWin: [1, 2, 3, 4].map((winNumber) => ({
      winNumber,
      points: getWinStepPoints(sampleTeamValue, winNumber),
    })),
    byGames: [4, 5, 6, 7].map((games) => ({
      games,
      points: getSeriesWinPoints(sampleTeamValue, roundKey, games),
    })),
  }));
}

export function validateTeamValueAssignments(assignments, teamIds) {
  const values = Object.entries(assignments ?? {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([teamId, value]) => ({ teamId, value: Number(value) }));

  const teamSet = new Set(teamIds ?? []);
  const assignedTeamIds = new Set(values.map((entry) => entry.teamId));
  const assignedValues = values.map((entry) => entry.value);
  const duplicates = assignedValues.filter((value, index) => assignedValues.indexOf(value) !== index);

  return {
    valid: duplicates.length === 0 && teamSet.size === assignedTeamIds.size && TEAM_VALUE_SLOTS.every((slot) => assignedValues.includes(slot)),
    missingTeams: [...teamSet].filter((teamId) => !assignedTeamIds.has(teamId)),
    duplicateValues: [...new Set(duplicates)].sort((a, b) => b - a),
    missingValues: TEAM_VALUE_SLOTS.filter((slot) => !assignedValues.includes(slot)),
  };
}

export function getDisplayRankFromValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return TEAM_VALUE_SLOTS.length + 1 - numericValue;
}

export function getValueFromDisplayRank(rank) {
  const numericRank = Number(rank);
  if (!Number.isFinite(numericRank) || numericRank <= 0) return null;
  return TEAM_VALUE_SLOTS.length + 1 - numericRank;
}

export function getPointsForDisplayRank(rank) {
  return getValueFromDisplayRank(rank);
}

export function scoreSeriesForAssignments(assignmentsByTeamId, series) {
  if (!series?.wins) return [];
  if (series.roundKey === "play_in") return [];

  const games = getSeriesLength(series);
  const homeWins = Math.max(0, Math.min(4, Number(series.wins.home ?? 0)));
  const awayWins = Math.max(0, Math.min(4, Number(series.wins.away ?? 0)));
  const homeId = series.homeTeam?.id ?? series.homeTeamId ?? null;
  const awayId = series.awayTeam?.id ?? series.awayTeamId ?? null;
  const winnerId = series.status === "completed" ? series.winnerTeamId ?? null : null;

  return [
    {
      teamId: homeId,
      roundKey: series.roundKey,
      wins: homeWins,
      games,
      isWinner: winnerId === homeId,
      points: getTeamPointsForSeriesProgress(
        Number(assignmentsByTeamId?.[homeId] ?? 0),
        homeWins,
        series.roundKey,
        winnerId === homeId ? games : null
      ),
    },
    {
      teamId: awayId,
      roundKey: series.roundKey,
      wins: awayWins,
      games,
      isWinner: winnerId === awayId,
      points: getTeamPointsForSeriesProgress(
        Number(assignmentsByTeamId?.[awayId] ?? 0),
        awayWins,
        series.roundKey,
        winnerId === awayId ? games : null
      ),
    },
  ].filter((entry) => entry.teamId && entry.points > 0);
}

export function summarizeBoardPoints(assignmentsByTeamId, series) {
  return series.reduce(
    (accumulator, seriesItem) => {
      const results = scoreSeriesForAssignments(assignmentsByTeamId, seriesItem);
      if (!results.length) return accumulator;

      accumulator.totalPoints += results.reduce((sum, result) => sum + result.points, 0);
      accumulator.scoredSeries += 1;
      results.forEach((result) => {
        accumulator.byRound[result.roundKey] = (accumulator.byRound[result.roundKey] ?? 0) + result.points;
      });
      return accumulator;
    },
    {
      totalPoints: 0,
      scoredSeries: 0,
      byRound: {
        round_1: 0,
        semifinals: 0,
        finals: 0,
        nba_finals: 0,
      },
    }
  );
}

export function getRemainingLiveValue(assignmentsByTeamId, eliminatedTeamIds) {
  const eliminated = new Set(eliminatedTeamIds ?? []);
  return Object.entries(assignmentsByTeamId ?? {}).reduce((sum, [teamId, value]) => {
    if (eliminated.has(teamId)) return sum;
    return sum + Number(value ?? 0);
  }, 0);
}

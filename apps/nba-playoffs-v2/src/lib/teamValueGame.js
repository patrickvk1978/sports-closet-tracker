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

export function getSeriesLength(series) {
  if (!series?.wins) return null;
  const total = Number(series.wins.home ?? 0) + Number(series.wins.away ?? 0);
  return total >= 4 && total <= 7 ? total : null;
}

export function getSeriesWinPoints(teamValue, roundKey, games) {
  const normalizedTeamValue = Number(teamValue);
  if (!Number.isFinite(normalizedTeamValue) || normalizedTeamValue <= 0) return 0;

  const roundBonus = ROUND_BONUS[roundKey] ?? 0;
  const lengthBonus = SERIES_LENGTH_BONUS[games] ?? 0;
  return normalizedTeamValue + roundBonus + lengthBonus;
}

export function buildScoringTable(sampleTeamValue = 16) {
  return Object.keys(ROUND_BONUS).map((roundKey) => ({
    roundKey,
    label: ROUND_LABELS[roundKey] ?? roundKey,
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
  if (series?.status !== "completed" || !series?.winnerTeamId) return null;

  const games = getSeriesLength(series);
  if (!games) return null;

  const winningValue = Number(assignmentsByTeamId?.[series.winnerTeamId] ?? 0);
  return {
    teamId: series.winnerTeamId,
    roundKey: series.roundKey,
    games,
    points: getSeriesWinPoints(winningValue, series.roundKey, games),
  };
}

export function summarizeBoardPoints(assignmentsByTeamId, series) {
  return series.reduce(
    (accumulator, seriesItem) => {
      const result = scoreSeriesForAssignments(assignmentsByTeamId, seriesItem);
      if (!result) return accumulator;

      accumulator.totalPoints += result.points;
      accumulator.scoredSeries += 1;
      accumulator.byRound[result.roundKey] = (accumulator.byRound[result.roundKey] ?? 0) + result.points;
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

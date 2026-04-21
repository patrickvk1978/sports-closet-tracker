import { getDisplayRankFromValue, TEAM_VALUE_SLOTS } from "./teamValueGame";

function getUserAssignments(allAssignmentsByUser, userId) {
  return allAssignmentsByUser?.[userId] ?? {};
}

function getRank(assignments, teamId) {
  return getDisplayRankFromValue(assignments?.[teamId] ?? 0);
}

function getAssignedValue(assignments, teamId) {
  return Number(assignments?.[teamId] ?? 0);
}

function getAverageRank(teamId, memberList, allAssignmentsByUser) {
  const ranks = (memberList ?? [])
    .map((member) => getRank(getUserAssignments(allAssignmentsByUser, member.id), teamId))
    .filter((value) => Number.isFinite(value));

  if (!ranks.length) return null;
  return Number((ranks.reduce((sum, value) => sum + value, 0) / ranks.length).toFixed(1));
}

export function buildBoardMatrixRows(teams, memberList, allAssignmentsByUser, anchorUserId) {
  const teamById = Object.fromEntries((teams ?? []).map((team) => [team.id, team]));

  return [...TEAM_VALUE_SLOTS]
    .sort((a, b) => b - a)
    .map((slotValue) => {
      const rank = getDisplayRankFromValue(slotValue);
      return {
        slotValue,
        rank,
        teamsByUser: Object.fromEntries(
          (memberList ?? []).map((member) => {
            const assignments = getUserAssignments(allAssignmentsByUser, member.id);
            const teamId =
              Object.entries(assignments ?? {}).find(([, value]) => Number(value) === slotValue)?.[0] ?? null;
            return [member.id, teamId ? teamById[teamId] ?? null : null];
          })
        ),
      };
    });
}

export function buildBoardComparisonRows(teams, leftAssignments, rightAssignments) {
  return [...(teams ?? [])]
    .map((team) => {
      const leftRank = getRank(leftAssignments, team.id);
      const rightRank = getRank(rightAssignments, team.id);
      const gap =
        Number.isFinite(leftRank) && Number.isFinite(rightRank)
          ? Math.abs(leftRank - rightRank)
          : null;

      return {
        ...team,
        leftRank,
        rightRank,
        gap,
      };
    })
    .sort((a, b) => {
      const gapA = Number.isFinite(a.gap) ? a.gap : -1;
      const gapB = Number.isFinite(b.gap) ? b.gap : -1;
      if (gapA !== gapB) return gapB - gapA;
      const leftA = Number.isFinite(a.leftRank) ? a.leftRank : 99;
      const leftB = Number.isFinite(b.leftRank) ? b.leftRank : 99;
      return leftA - leftB || a.seed - b.seed;
    });
}

export function buildBoardComparisonSummary(rows) {
  const withBoth = rows.filter((row) => Number.isFinite(row.leftRank) && Number.isFinite(row.rightRank));
  const exactMatches = withBoth.filter((row) => row.leftRank === row.rightRank).length;
  const averageGap = withBoth.length
    ? Number((withBoth.reduce((sum, row) => sum + row.gap, 0) / withBoth.length).toFixed(1))
    : 0;
  const biggestDisagreements = withBoth.filter((row) => row.gap > 0).slice(0, 3);
  const biggestGap = biggestDisagreements[0]?.gap ?? 0;

  return {
    exactMatches,
    averageGap,
    biggestGap,
    biggestDisagreements,
  };
}

export function buildBoardComparisonPressureRows(seriesItems, leftAssignments, rightAssignments) {
  return [...(seriesItems ?? [])]
    .map((series) => {
      const homeLeft = getAssignedValue(leftAssignments, series.homeTeamId);
      const awayLeft = getAssignedValue(leftAssignments, series.awayTeamId);
      const homeRight = getAssignedValue(rightAssignments, series.homeTeamId);
      const awayRight = getAssignedValue(rightAssignments, series.awayTeamId);
      const leftNet = homeLeft - awayLeft;
      const rightNet = homeRight - awayRight;
      const swing = leftNet - rightNet;
      const swingMagnitude = Math.abs(swing);
      const exposureTotal = homeLeft + awayLeft + homeRight + awayRight;

      const leftPreferred =
        leftNet === 0 ? null : leftNet > 0 ? series.homeTeam ?? null : series.awayTeam ?? null;
      const rightPreferred =
        rightNet === 0 ? null : rightNet > 0 ? series.homeTeam ?? null : series.awayTeam ?? null;
      const favoriteForSwing =
        swing === 0
          ? null
          : swing > 0
            ? (leftNet >= 0 ? series.homeTeam ?? null : series.awayTeam ?? null)
            : (rightNet >= 0 ? series.homeTeam ?? null : series.awayTeam ?? null);

      return {
        id: series.id,
        series,
        homeLeft,
        awayLeft,
        homeRight,
        awayRight,
        leftNet,
        rightNet,
        swing,
        swingMagnitude,
        exposureTotal,
        leftPreferred,
        rightPreferred,
        favoriteForSwing,
        conflict:
          Boolean(leftPreferred?.id) &&
          Boolean(rightPreferred?.id) &&
          leftPreferred.id !== rightPreferred.id,
      };
    })
    .sort((a, b) => b.swingMagnitude - a.swingMagnitude || b.exposureTotal - a.exposureTotal);
}

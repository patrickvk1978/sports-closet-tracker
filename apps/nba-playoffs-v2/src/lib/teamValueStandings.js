import { getRemainingLiveValue, summarizeBoardPoints } from "./teamValueGame";

function buildEliminatedTeamIds(series) {
  return series
    .filter((seriesItem) => seriesItem.status === "completed" && seriesItem.winnerTeamId)
    .flatMap((seriesItem) => {
      const loserId =
        seriesItem.winnerTeamId === seriesItem.homeTeam?.id ? seriesItem.awayTeam?.id : seriesItem.homeTeam?.id;
      return loserId ? [loserId] : [];
    });
}

function getBestRemainingAsset(assignmentsByTeamId, eliminatedTeamIds) {
  const eliminated = new Set(eliminatedTeamIds);
  const remaining = Object.entries(assignmentsByTeamId ?? {})
    .filter(([teamId]) => !eliminated.has(teamId))
    .map(([teamId, value]) => ({ teamId, value: Number(value ?? 0) }))
    .sort((a, b) => b.value - a.value);

  return remaining[0] ?? null;
}

export function buildTeamValueStandings(memberList, allAssignmentsByUser, series) {
  const eliminatedTeamIds = buildEliminatedTeamIds(series);

  const sortedMembers = memberList
    .map((member) => {
      const assignments = allAssignmentsByUser?.[member.id] ?? {};
      const summary = summarizeBoardPoints(assignments, series);
      const liveValueRemaining = getRemainingLiveValue(assignments, eliminatedTeamIds);
      const bestRemainingAsset = getBestRemainingAsset(assignments, eliminatedTeamIds);

      return {
        ...member,
        summary,
        liveValueRemaining,
        bestRemainingAsset,
      };
    })
    .sort(
      (a, b) =>
        b.summary.totalPoints - a.summary.totalPoints ||
        b.liveValueRemaining - a.liveValueRemaining ||
        (b.bestRemainingAsset?.value ?? 0) - (a.bestRemainingAsset?.value ?? 0) ||
        a.name.localeCompare(b.name)
    );

  let previousPoints = null;
  let previousPlace = 0;
  return sortedMembers.map((member, index, array) => {
    const currentPoints = Number(member.summary.totalPoints ?? 0);
    const place = previousPoints !== null && currentPoints === previousPoints ? previousPlace : index + 1;
    previousPoints = currentPoints;
    previousPlace = place;

    return {
      ...member,
      place,
      pointsBack: Math.max((array[0]?.summary.totalPoints ?? 0) - currentPoints, 0),
    };
  });
}

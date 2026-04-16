import { scoreSeriesPickAgainstResult, summarizePickScores } from "./seriesPickem";

export function buildStandings(memberList, allPicksByUser, series, settings) {
  return memberList
    .map((member) => ({
      ...member,
      summary: summarizePickScores(allPicksByUser[member.id] ?? {}, series, settings),
    }))
    .sort(
      (a, b) =>
        b.summary.totalPoints - a.summary.totalPoints ||
        b.summary.exact - a.summary.exact ||
        b.summary.close - a.summary.close ||
        b.summary.near - a.summary.near ||
        (a.name ?? "").localeCompare(b.name ?? "")
    )
    .map((member, index, array) => ({
      ...member,
      place: index + 1,
      pointsBack: Math.max((array[0]?.summary.totalPoints ?? 0) - member.summary.totalPoints, 0),
    }));
}

function normalizeWeights(weights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / total);
}

function sampleByWeights(values, weights, randomValue) {
  let threshold = randomValue;
  for (let index = 0; index < values.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) return values[index];
  }
  return values[values.length - 1];
}

function sampleSeriesGames(teamWinPct, randomValue) {
  const clamped = Math.max(0.2, Math.min(teamWinPct / 100, 0.8));
  const strength = (clamped - 0.5) / 0.3;
  const weights = normalizeWeights([
    Math.max(0.04, 0.1 + strength * 0.1),
    Math.max(0.08, 0.22 + strength * 0.06),
    Math.max(0.16, 0.35 - strength * 0.05),
    Math.max(0.16, 0.33 - strength * 0.11),
  ]);
  return sampleByWeights([4, 5, 6, 7], weights, randomValue);
}

function sampleSeriesResult(series) {
  const homeWinPct = series.market?.homeWinPct ?? 50;
  const homeWins = Math.random() <= homeWinPct / 100;
  const winnerTeamId = homeWins ? series.homeTeam.id : series.awayTeam.id;
  const winnerWinPct = homeWins ? homeWinPct : series.market?.awayWinPct ?? 50;
  const games = sampleSeriesGames(winnerWinPct, Math.random());
  return { winnerTeamId, games };
}

export function buildCurrentRoundWinOdds(memberList, allPicksByUser, currentRoundSeries, allSeries, settings, iterations = 3000) {
  const baseStandings = buildStandings(memberList, allPicksByUser, allSeries, settings);
  const unresolvedSeries = currentRoundSeries.filter((series) => series.status !== "completed");

  if (!memberList.length) {
    return {};
  }

  if (!unresolvedSeries.length) {
    const bestScore = Math.max(...baseStandings.map((member) => member.summary.totalPoints));
    const leaders = baseStandings.filter((member) => member.summary.totalPoints === bestScore);
    const share = leaders.length ? 100 / leaders.length : 0;
    return Object.fromEntries(memberList.map((member) => [member.id, leaders.some((leader) => leader.id === member.id) ? share : 0]));
  }

  const basePointsByMember = Object.fromEntries(baseStandings.map((member) => [member.id, member.summary.totalPoints]));
  const winShareByMember = Object.fromEntries(memberList.map((member) => [member.id, 0]));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const totals = { ...basePointsByMember };

    for (const series of unresolvedSeries) {
      const simulatedResult = sampleSeriesResult(series);
      for (const member of memberList) {
        const pick = allPicksByUser[member.id]?.[series.id] ?? null;
        const score = scoreSeriesPickAgainstResult(pick, simulatedResult, series.roundKey, settings);
        if (score) {
          totals[member.id] += score.points;
        }
      }
    }

    const bestScore = Math.max(...Object.values(totals));
    const leaders = memberList.filter((member) => totals[member.id] === bestScore);
    const share = leaders.length ? 1 / leaders.length : 0;
    leaders.forEach((member) => {
      winShareByMember[member.id] += share;
    });
  }

  return Object.fromEntries(
    memberList.map((member) => [member.id, Number(((winShareByMember[member.id] / iterations) * 100).toFixed(1))])
  );
}

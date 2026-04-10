const ROUND_ORDER = ["round_1", "semifinals", "finals", "nba_finals"];

export function getSeriesResult(series) {
  if (series.status !== "completed" || !series.winnerTeamId) return null;

  return {
    winnerTeamId: series.winnerTeamId,
    games: series.wins.home + series.wins.away,
  };
}

export function scoreSeriesPick(pick, series, settings) {
  const result = getSeriesResult(series);
  if (!pick || !result) return null;

  if (pick.winnerTeamId !== result.winnerTeamId) {
    return {
      points: 0,
      outcome: "miss",
      label: "Wrong winner",
    };
  }

  const exactBase = Number(settings?.points_per_correct_series ?? 3);
  const exactBonus = Number(settings?.bonus_for_exact_games ?? 1);
  const gameDiff = Math.abs(Number(pick.games) - result.games);

  if (gameDiff === 0) {
    return {
      points: exactBase + exactBonus,
      outcome: "exact",
      label: "Exact series and length",
    };
  }

  if (gameDiff === 1) {
    return {
      points: Math.max(exactBase - 1, 1),
      outcome: "close",
      label: "Correct winner, off by 1 game",
    };
  }

  if (gameDiff === 2) {
    return {
      points: 1,
      outcome: "near",
      label: "Correct winner, off by 2 games",
    };
  }

  return {
    points: 0,
    outcome: "miss",
    label: "Correct winner, too far on length",
  };
}

export function getAvailableRoundKey(roundSummaries) {
  for (const roundKey of ROUND_ORDER) {
    const summary = roundSummaries.find((item) => item.key === roundKey);
    if (!summary) continue;
    if (summary.completedSeries < summary.totalSeries) return roundKey;
  }
  return "nba_finals";
}

export function isRoundUnlocked(roundKey, roundSummaries) {
  const currentRoundKey = getAvailableRoundKey(roundSummaries);
  return ROUND_ORDER.indexOf(roundKey) <= ROUND_ORDER.indexOf(currentRoundKey);
}

export function summarizePickScores(picksBySeriesId, series, settings) {
  return series.reduce(
    (accumulator, item) => {
      const score = scoreSeriesPick(picksBySeriesId[item.id], item, settings);
      if (!score) return accumulator;

      accumulator.totalPoints += score.points;
      if (score.outcome === "exact") accumulator.exact += 1;
      if (score.outcome === "close") accumulator.close += 1;
      if (score.outcome === "near") accumulator.near += 1;
      if (score.outcome === "miss") accumulator.miss += 1;
      return accumulator;
    },
    { totalPoints: 0, exact: 0, close: 0, near: 0, miss: 0 }
  );
}

export function summarizeSeriesMarket(allPicksByUser, memberList, series) {
  const picks = memberList
    .map((member) => ({
      member,
      pick: allPicksByUser[member.id]?.[series.id] ?? null,
    }))
    .filter((entry) => entry.pick?.winnerTeamId);

  const homeBackers = picks.filter((entry) => entry.pick.winnerTeamId === series.homeTeam.id);
  const awayBackers = picks.filter((entry) => entry.pick.winnerTeamId === series.awayTeam.id);
  const total = picks.length;

  const byGames = picks.reduce((accumulator, entry) => {
    const key = String(entry.pick.games);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const leadingGames = Object.entries(byGames).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0] ?? null;

  return {
    total,
    homeBackers: homeBackers.length,
    awayBackers: awayBackers.length,
    homePct: total ? Math.round((homeBackers.length / total) * 100) : 0,
    awayPct: total ? Math.round((awayBackers.length / total) * 100) : 0,
    consensusWinnerTeamId:
      total === 0
        ? null
        : homeBackers.length === awayBackers.length
          ? null
          : homeBackers.length > awayBackers.length
            ? series.homeTeam.id
            : series.awayTeam.id,
    leadingGames: leadingGames ? Number(leadingGames[0]) : null,
    leadingGamesCount: leadingGames ? leadingGames[1] : 0,
    noPickCount: memberList.length - total,
  };
}

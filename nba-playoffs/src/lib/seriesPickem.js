const ROUND_ORDER = ["round_1", "semifinals", "finals", "nba_finals"];

export const ROUND_SCORING = {
  round_1: { exactBase: 5, edgeBonus: 1, offBy1: 3, offBy2: 1 },
  semifinals: { exactBase: 7, edgeBonus: 1, offBy1: 4, offBy2: 1 },
  finals: { exactBase: 9, edgeBonus: 1, offBy1: 5, offBy2: 2 },
  nba_finals: { exactBase: 11, edgeBonus: 1, offBy1: 6, offBy2: 2 },
};

const EDGE_GAMES = new Set([4, 7]);

export function getRoundScoring(roundKey, settings) {
  const fallback = ROUND_SCORING[roundKey] ?? ROUND_SCORING.round_1;
  const customMatrix = settings?.round_scoring;
  if (!customMatrix || typeof customMatrix !== "object") return fallback;

  const custom = customMatrix[roundKey];
  if (!custom || typeof custom !== "object") return fallback;

  return {
    exactBase: Number(custom.exactBase ?? fallback.exactBase),
    edgeBonus: Number(custom.edgeBonus ?? fallback.edgeBonus),
    offBy1: Number(custom.offBy1 ?? fallback.offBy1),
    offBy2: Number(custom.offBy2 ?? fallback.offBy2),
  };
}

export function describeRoundScoring(roundKey, settings) {
  const scoring = getRoundScoring(roundKey, settings);
  return {
    ...scoring,
    exactEdge: scoring.exactBase + scoring.edgeBonus,
  };
}

export function getSeriesResult(series) {
  if (series.status !== "completed" || !series.winnerTeamId) return null;

  return {
    winnerTeamId: series.winnerTeamId,
    games: series.wins.home + series.wins.away,
  };
}

export function scoreSeriesPickAgainstResult(pick, result, roundKey, settings) {
  if (!pick || !result) return null;
  if (pick.winnerTeamId !== result.winnerTeamId) {
    return {
      points: 0,
      outcome: "miss",
      label: "Wrong winner",
    };
  }

  const scoring = getRoundScoring(roundKey, settings);
  const gameDiff = Math.abs(Number(pick.games) - result.games);

  if (gameDiff === 0) {
    const edgeBonus = EDGE_GAMES.has(result.games) ? scoring.edgeBonus : 0;
    return {
      points: scoring.exactBase + edgeBonus,
      outcome: "exact",
      label: edgeBonus ? `Exact ${result.games}-game call` : "Exact series and length",
    };
  }

  if (gameDiff === 1) {
    return {
      points: scoring.offBy1,
      outcome: "close",
      label: "Correct winner, off by 1 game",
    };
  }

  if (gameDiff === 2) {
    return {
      points: scoring.offBy2,
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

export function scoreSeriesPick(pick, series, settings) {
  const result = getSeriesResult(series);
  if (!pick || !result) return null;
  return scoreSeriesPickAgainstResult(pick, result, series.roundKey, settings);
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

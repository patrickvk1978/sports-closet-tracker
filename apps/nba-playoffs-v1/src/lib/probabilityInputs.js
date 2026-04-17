import { SERIES_PROBABILITY_INPUTS } from "../data/probabilityInputs";

const DEFAULT_PROBABILITY = {
  sourceName: "fallback_even",
  homeWinPct: 50,
  awayWinPct: 50,
  capturedAt: null,
  exactResults: null,
};

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - (k - i))) / i;
  }
  return result;
}

export function buildExactResultProbabilities(homeWinPct, wins = { home: 0, away: 0 }) {
  const p = Math.max(0.1, Math.min((homeWinPct ?? 50) / 100, 0.9));
  const currentHomeWins = Number(wins?.home ?? 0);
  const currentAwayWins = Number(wins?.away ?? 0);
  const gamesPlayed = currentHomeWins + currentAwayWins;
  const homeNeeded = Math.max(0, 4 - currentHomeWins);
  const awayNeeded = Math.max(0, 4 - currentAwayWins);
  const distribution = Object.fromEntries(
    ["home", "away"].flatMap((side) => [4, 5, 6, 7].map((games) => [`${side}_${games}`, 0]))
  );

  if (homeNeeded === 0) {
    distribution[`home_${gamesPlayed}`] = 100;
    return distribution;
  }
  if (awayNeeded === 0) {
    distribution[`away_${gamesPlayed}`] = 100;
    return distribution;
  }

  const minRemainingGames = Math.min(homeNeeded, awayNeeded);
  const maxRemainingGames = homeNeeded + awayNeeded - 1;

  for (let remainingGames = minRemainingGames; remainingGames <= maxRemainingGames; remainingGames += 1) {
    const finalGames = gamesPlayed + remainingGames;
    if (finalGames < 4 || finalGames > 7) continue;

    if (remainingGames >= homeNeeded) {
      const probability =
        combination(remainingGames - 1, homeNeeded - 1) *
        p ** homeNeeded *
        (1 - p) ** (remainingGames - homeNeeded);
      distribution[`home_${finalGames}`] = Number((probability * 100).toFixed(4));
    }

    if (remainingGames >= awayNeeded) {
      const probability =
        combination(remainingGames - 1, awayNeeded - 1) *
        (1 - p) ** awayNeeded *
        p ** (remainingGames - awayNeeded);
      distribution[`away_${finalGames}`] = Number((probability * 100).toFixed(4));
    }
  }

  return distribution;
}

export function getProbabilityInputsForSeries(seriesId, options = {}) {
  const entry = SERIES_PROBABILITY_INPUTS[seriesId] ?? {};
  const wins = options?.wins ?? { home: 0, away: 0 };
  const market = {
    ...DEFAULT_PROBABILITY,
    ...(entry.market ?? {}),
  };
  const model = {
    ...DEFAULT_PROBABILITY,
    ...(entry.model ?? {}),
  };
  return {
    market: {
      ...market,
      exactResults: buildExactResultProbabilities(market.homeWinPct, wins),
    },
    model: {
      ...model,
      exactResults: buildExactResultProbabilities(model.homeWinPct, wins),
    },
  };
}

export function mergeProbabilityInputs(seriesId, sharedEntry, options = {}) {
  const fallback = getProbabilityInputsForSeries(seriesId, options);
  return {
    market: {
      ...fallback.market,
      ...(sharedEntry?.market ?? {}),
      exactResults: sharedEntry?.marketExact?.exactResults ?? fallback.market.exactResults,
    },
    model: {
      ...fallback.model,
      ...(sharedEntry?.model ?? {}),
      exactResults: sharedEntry?.modelExact?.exactResults ?? fallback.model.exactResults,
    },
  };
}

export function formatProbabilitySourceLabel(probability) {
  const sourceName = probability?.sourceName ?? "unknown_source";
  if (sourceName === "fanduel_static_game_apr_14_2026") return "FanDuel static game market";
  if (sourceName === "fanduel_static_series_apr_13_2026") return "FanDuel static series market";
  if (sourceName === "fanduel_static_game_apr_13_2026") return "FanDuel static game market";
  if (sourceName === "fanduel_static_series_apr_15_2026") return "FanDuel static series market";
  if (sourceName === "fanduel_static_game_apr_15_2026") return "FanDuel static game market";
  if (sourceName === "post_playin_estimate_apr_16_2026") return "Post play-in estimate";
  if (sourceName === "completed_playin_game_apr_14_2026") return "Completed play-in result";
  if (sourceName === "completed_playin_game_apr_15_2026") return "Completed play-in result";
  if (sourceName === "provisional_seed_estimate") return "Current-seed estimate";
  if (sourceName === "future_round_estimate") return "Future-round estimate";
  if (sourceName.endsWith("_exact_result_derived")) return "Derived exact-result view";
  if (sourceName === "local_seeded_market") return "Local seeded market";
  if (sourceName === "local_seeded_model") return "Local seeded model";
  if (sourceName === "fallback_even") return "Fallback even split";
  return sourceName.replaceAll("_", " ");
}

export function formatProbabilityMainLabel(probability, fallback = "Estimate") {
  const sourceName = probability?.sourceName ?? "";
  if (!sourceName) return fallback;
  if (sourceName.includes("market") || sourceName === "provisional_seed_estimate" || sourceName.includes("estimate")) {
    return "Market estimate";
  }
  if (sourceName.includes("model")) {
    return "Model estimate";
  }
  return fallback;
}

export function formatProbabilityMainFreshness(probability) {
  if (!probability?.capturedAt) return null;
  try {
    const updated = new Date(probability.capturedAt);
    const now = new Date();
    const sameDay =
      updated.getFullYear() === now.getFullYear() &&
      updated.getMonth() === now.getMonth() &&
      updated.getDate() === now.getDate();
    if (sameDay) return "Updated today";
    return `Updated ${updated.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  } catch {
    return null;
  }
}

export function formatProbabilityFreshness(probability) {
  if (!probability?.capturedAt) return "No timestamp";
  try {
    return `Updated ${new Date(probability.capturedAt).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;
  } catch {
    return "Timestamp unavailable";
  }
}

export function describeTopExactResult(series, exactResults) {
  if (!series || !exactResults) return null;

  const entries = Object.entries(exactResults)
    .filter(([, probability]) => Number(probability) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  if (!entries.length) return null;

  const [key, probability] = entries[0];
  const [side, gamesText] = key.split("_");
  const games = Number(gamesText);
  const team = side === "home" ? series.homeTeam : series.awayTeam;

  if (!team?.abbreviation || Number.isNaN(games)) return null;
  return `${team.abbreviation} in ${games} (${Math.round(Number(probability))}%)`;
}

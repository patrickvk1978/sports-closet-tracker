import { SERIES_PROBABILITY_INPUTS } from "../data/probabilityInputs";

const DEFAULT_PROBABILITY = {
  sourceName: "fallback_even",
  homeWinPct: 50,
  awayWinPct: 50,
  capturedAt: null,
};

export function getProbabilityInputsForSeries(seriesId) {
  const entry = SERIES_PROBABILITY_INPUTS[seriesId] ?? {};
  return {
    market: {
      ...DEFAULT_PROBABILITY,
      ...(entry.market ?? {}),
    },
    model: {
      ...DEFAULT_PROBABILITY,
      ...(entry.model ?? {}),
    },
  };
}

export function mergeProbabilityInputs(seriesId, sharedEntry) {
  const fallback = getProbabilityInputsForSeries(seriesId);
  return {
    market: {
      ...fallback.market,
      ...(sharedEntry?.market ?? {}),
    },
    model: {
      ...fallback.model,
      ...(sharedEntry?.model ?? {}),
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
  if (sourceName === "local_seeded_market") return "Local seeded market";
  if (sourceName === "local_seeded_model") return "Local seeded model";
  if (sourceName === "fallback_even") return "Fallback even split";
  return sourceName.replaceAll("_", " ");
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

import { useMemo } from "react";
import { formatProbabilityFreshness, formatProbabilitySourceLabel } from "../lib/probabilityInputs";

export function useProbabilityInputs(seriesList = []) {
  return useMemo(
    () =>
      seriesList.map((series) => ({
        entityId: series.id,
        market: series.market,
        model: series.model,
        marketLabel: formatProbabilitySourceLabel(series.market),
        modelLabel: formatProbabilitySourceLabel(series.model),
        marketFreshness: formatProbabilityFreshness(series.market),
        modelFreshness: formatProbabilityFreshness(series.model),
      })),
    [seriesList]
  );
}

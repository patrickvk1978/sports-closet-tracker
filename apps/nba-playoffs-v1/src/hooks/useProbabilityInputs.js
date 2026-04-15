import { useMemo } from "react";
import { useBackendProbabilityInputs } from "./useBackendProbabilityInputs";
import {
  formatProbabilityFreshness,
  formatProbabilitySourceLabel,
  mergeProbabilityInputs,
} from "../lib/probabilityInputs";

export function useProbabilityInputs(seriesList = []) {
  const entityIds = useMemo(() => seriesList.map((series) => series.id), [seriesList]);
  const { probabilityMap } = useBackendProbabilityInputs({
    productKey: "nba_playoffs",
    entityIds,
    entityType: "series",
  });

  return useMemo(
    () =>
      seriesList.map((series) => {
        const merged = mergeProbabilityInputs(series.id, probabilityMap?.[series.id]);
        return {
          entityId: series.id,
          market: merged.market,
          model: merged.model,
          marketLabel: formatProbabilitySourceLabel(merged.market),
          modelLabel: formatProbabilitySourceLabel(merged.model),
          marketFreshness: formatProbabilityFreshness(merged.market),
          modelFreshness: formatProbabilityFreshness(merged.model),
        };
      }),
    [probabilityMap, seriesList]
  );
}

import { useMemo } from "react";
import { buildCommentaryPreview } from "../lib/insights";

export function useCommentary({
  featuredSeries,
  activeRoundSeries,
  picksBySeriesId,
  allPicksByUser,
  memberList,
  currentRound,
  currentStanding,
  scenarioItems,
  scenarioDate,
  canViewPoolSignals,
  picksLoading,
}) {
  return useMemo(
    () =>
      buildCommentaryPreview({
        featuredSeries,
        activeRoundSeries,
        picksBySeriesId,
        allPicksByUser,
        memberList,
        currentRound,
        currentStanding,
        scenarioItems,
        scenarioDate,
        canViewPoolSignals,
        picksLoading,
      }),
    [
      activeRoundSeries,
      allPicksByUser,
      currentRound,
      currentStanding,
      featuredSeries,
      memberList,
      picksBySeriesId,
      scenarioDate,
      scenarioItems,
      canViewPoolSignals,
      picksLoading,
    ]
  );
}

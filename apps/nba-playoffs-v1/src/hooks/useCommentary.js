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
    () => {
      try {
        return buildCommentaryPreview({
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
        });
      } catch {
        return null;
      }
    },
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

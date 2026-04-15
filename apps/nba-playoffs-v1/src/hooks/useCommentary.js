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
    ]
  );
}

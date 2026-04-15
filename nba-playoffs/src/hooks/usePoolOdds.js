import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { usePool } from "./usePool";
import { usePlayoffData } from "./usePlayoffData.jsx";
import { useSeriesPickem } from "./useSeriesPickem";
import { buildCurrentRoundWinOdds, buildStandings } from "../lib/standings";

export function usePoolOdds(windowKey) {
  const { profile } = useAuth();
  const { pool, memberList, settingsForPool } = usePool();
  const { series, currentRound, seriesByRound } = usePlayoffData();
  const settings = settingsForPool(pool);
  const { allPicksByUser } = useSeriesPickem(series);

  const effectiveWindowKey = windowKey ?? currentRound.key;
  const windowSeries = seriesByRound[effectiveWindowKey] ?? [];

  const standings = useMemo(
    () => buildStandings(memberList, allPicksByUser, series, settings),
    [allPicksByUser, memberList, series, settings]
  );

  const winOddsByUser = useMemo(
    () => buildCurrentRoundWinOdds(memberList, allPicksByUser, windowSeries, series, settings),
    [allPicksByUser, memberList, series, settings, windowSeries]
  );

  const standingsWithOdds = useMemo(
    () => standings.map((member) => ({ ...member, roundWinOdds: winOddsByUser[member.id] ?? 0 })),
    [standings, winOddsByUser]
  );

  const currentStanding = standingsWithOdds.find((member) => member.id === profile?.id) ?? null;
  const leader = standingsWithOdds[0] ?? null;

  return {
    windowKey: effectiveWindowKey,
    standings: standingsWithOdds,
    winOddsByUser,
    currentStanding,
    leader,
  };
}

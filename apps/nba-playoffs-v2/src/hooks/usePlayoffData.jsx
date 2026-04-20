import { createContext, useContext, useMemo } from "react";
import { PLAYOFF_ROUNDS, PLAYOFF_SERIES, PLAYOFF_TEAMS } from "../data/playoffData";
import { useBackendProbabilityInputs } from "./useBackendProbabilityInputs";
import { useBackendMatchupState } from "./useBackendMatchupState";
import { usePool } from "./usePool";
import { mergeProbabilityInputs } from "../lib/probabilityInputs";

const PlayoffDataContext = createContext(null);

function buildRoundSummaries(series) {
  return PLAYOFF_ROUNDS.map((round) => {
    const roundSeries = series.filter((item) => item.roundKey === round.key);
    const completed = roundSeries.filter((item) => item.status === "completed").length;
    const live = roundSeries.filter((item) => item.status === "in_progress").length;

    return {
      ...round,
      totalSeries: roundSeries.length,
      completedSeries: completed,
      liveSeries: live,
    };
  });
}

export function PlayoffDataProvider({ children }) {
  const { pool } = usePool();
  const seriesIds = useMemo(() => PLAYOFF_SERIES.map((item) => item.id), []);
  const { probabilityMap } = useBackendProbabilityInputs({
    productKey: "nba_playoffs",
    entityIds: seriesIds,
    entityType: "series",
  });
  const { matchupStateBySeriesId } = useBackendMatchupState(pool?.id);

  const value = useMemo(() => {
    const teamsById = Object.fromEntries(PLAYOFF_TEAMS.map((team) => [team.id, team]));
    const series = PLAYOFF_SERIES.map((item) => {
      const matchupState = matchupStateBySeriesId?.[item.id] ?? null;
      const homeTeamId = matchupState?.homeTeamId ?? item.homeTeamId;
      const awayTeamId = matchupState?.awayTeamId ?? item.awayTeamId;
      const homeTeam = teamsById[homeTeamId] ?? teamsById[item.homeTeamId];
      const awayTeam = teamsById[awayTeamId] ?? teamsById[item.awayTeamId];
      const probabilityInputs = mergeProbabilityInputs(item.id, probabilityMap?.[item.id]);
      const wins = {
        home: matchupState?.wins?.home ?? item.wins.home,
        away: matchupState?.wins?.away ?? item.wins.away,
      };
      const status = matchupState?.status ?? item.status;
      const winnerTeamId = matchupState?.winnerTeamId ?? item.winnerTeamId ?? null;
      return {
        ...item,
        homeTeamId,
        awayTeamId,
        homeTeam,
        awayTeam,
        wins,
        status,
        winnerTeamId,
        schedule: {
          ...item.schedule,
          lockAt: matchupState?.lockAt ?? item.schedule?.lockAt ?? null,
          nextGame: item.schedule?.nextGame
            ? {
                ...item.schedule.nextGame,
                tipAt: matchupState?.nextGameAt ?? item.schedule?.nextGame?.tipAt ?? null,
                label:
                  matchupState?.nextHomeTeamId && matchupState?.nextAwayTeamId && matchupState?.nextGameNumber
                    ? `G${matchupState.nextGameNumber} ${(teamsById[matchupState.nextAwayTeamId]?.abbreviation ?? matchupState.nextAwayTeamId).toUpperCase()} at ${(teamsById[matchupState.nextHomeTeamId]?.abbreviation ?? matchupState.nextHomeTeamId).toUpperCase()}`
                    : item.schedule.nextGame.label,
              }
            : null,
        },
        market: probabilityInputs.market,
        model: probabilityInputs.model,
        totalGamesPlayed: wins.home + wins.away,
        clinchGames: winnerTeamId ? wins.home + wins.away : null,
      };
    });

    const seriesByRound = PLAYOFF_ROUNDS.reduce((accumulator, round) => {
      accumulator[round.key] = series.filter((item) => item.roundKey === round.key);
      return accumulator;
    }, {});

    const seriesByConference = {
      East: series.filter((item) => item.conference === "East"),
      West: series.filter((item) => item.conference === "West"),
      League: series.filter((item) => item.conference === "League"),
    };

    const currentRound =
      PLAYOFF_ROUNDS.find((round) =>
        series.some((item) => item.roundKey === round.key && item.status === "in_progress")
      ) ?? PLAYOFF_ROUNDS[0];

    const featuredSeries = series
      .filter((item) => item.status === "in_progress")
      .sort((a, b) => b.totalGamesPlayed - a.totalGamesPlayed || b.confidence - a.confidence)
      .slice(0, 3);

    return {
      teams: PLAYOFF_TEAMS,
      teamsById,
      rounds: PLAYOFF_ROUNDS,
      series,
      seriesByRound,
      seriesByConference,
      currentRound,
        featuredSeries,
      roundSummaries: buildRoundSummaries(series),
    };
  }, [matchupStateBySeriesId, probabilityMap, seriesIds]);

  return <PlayoffDataContext.Provider value={value}>{children}</PlayoffDataContext.Provider>;
}

export function usePlayoffData() {
  const context = useContext(PlayoffDataContext);
  if (!context) {
    throw new Error("usePlayoffData must be used inside PlayoffDataProvider");
  }
  return context;
}

import { createContext, useContext, useMemo } from "react";
import { PLAYOFF_ROUNDS, PLAYOFF_SERIES, PLAYOFF_TEAMS } from "../data/playoffData";

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
  const value = useMemo(() => {
    const teamsById = Object.fromEntries(PLAYOFF_TEAMS.map((team) => [team.id, team]));
    const series = PLAYOFF_SERIES.map((item) => {
      const homeTeam = teamsById[item.homeTeamId];
      const awayTeam = teamsById[item.awayTeamId];
      return {
        ...item,
        homeTeam,
        awayTeam,
        totalGamesPlayed: item.wins.home + item.wins.away,
        clinchGames: item.winnerTeamId ? item.wins.home + item.wins.away : null,
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
  }, []);

  return <PlayoffDataContext.Provider value={value}>{children}</PlayoffDataContext.Provider>;
}

export function usePlayoffData() {
  const context = useContext(PlayoffDataContext);
  if (!context) {
    throw new Error("usePlayoffData must be used inside PlayoffDataProvider");
  }
  return context;
}

import { useEffect, useState } from "react";

const ROUND_1_START = "2026-04-18";
const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

const ESPN_ABBR_TO_TEAM_ID = {
  DET: "det",
  BOS: "bos",
  NYK: "nyk",
  CLE: "cle",
  ATL: "atl",
  TOR: "tor",
  PHI: "phi",
  ORL: "orl",
  CHA: "cha",
  MIA: "mia",
  OKC: "okc",
  SA: "sas",
  DEN: "den",
  LAL: "lal",
  HOU: "hou",
  MIN: "min",
  POR: "por",
  PHX: "phx",
  GS: "gsw",
  LAC: "lac",
};

function formatScoreboardDate(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function listDates(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function isAliasTeamId(teamId) {
  return /seed-|playin-/.test(String(teamId ?? ""));
}

function resolveActualTeamId(teamId, teamsById, allTeams) {
  const team = teamsById?.[teamId];
  if (!team) return teamId ?? null;
  if (!isAliasTeamId(teamId)) return teamId;

  const resolved = allTeams.find(
    (candidate) =>
      !isAliasTeamId(candidate.id) &&
      candidate.abbreviation === team.abbreviation &&
      candidate.conference === team.conference
  );
  return resolved?.id ?? teamId;
}

function buildSeriesLookup(seriesItems, teamsById, allTeams) {
  return Object.fromEntries(
    (seriesItems ?? [])
      .filter((item) => item.roundKey !== "play_in")
      .map((item) => {
        const resolvedHome = resolveActualTeamId(item.homeTeamId, teamsById, allTeams);
        const resolvedAway = resolveActualTeamId(item.awayTeamId, teamsById, allTeams);
        const key = [resolvedHome, resolvedAway].sort().join("|");
        return [
          key,
          {
            id: item.id,
            resolvedHome,
            resolvedAway,
          },
        ];
      })
  );
}

function parseEspnSeriesSnapshot(event, lookup) {
  const competition = (event?.competitions ?? [])[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((entry) => entry.homeAway === "home");
  const away = competitors.find((entry) => entry.homeAway === "away");
  if (!home || !away) return null;

  const homeId = ESPN_ABBR_TO_TEAM_ID[home.team?.abbreviation ?? ""];
  const awayId = ESPN_ABBR_TO_TEAM_ID[away.team?.abbreviation ?? ""];
  if (!homeId || !awayId) return null;

  const key = [homeId, awayId].sort().join("|");
  const mappedSeries = lookup[key];
  if (!mappedSeries) return null;

  const status = competition?.status?.type ?? {};
  const seriesField = competition?.series;
  let normalizedHomeWins = 0;
  let normalizedAwayWins = 0;

  if (seriesField?.home && seriesField?.away) {
    const homeSeriesWins = Number(seriesField.home?.wins ?? 0);
    const awaySeriesWins = Number(seriesField.away?.wins ?? 0);
    normalizedHomeWins =
      mappedSeries.resolvedHome === homeId ? homeSeriesWins : awaySeriesWins;
    normalizedAwayWins =
      mappedSeries.resolvedAway === awayId ? awaySeriesWins : homeSeriesWins;
  } else if (status.completed) {
    const homeScore = Number(home.score ?? 0);
    const awayScore = Number(away.score ?? 0);
    const normalizedWinnerIsHome =
      (homeScore > awayScore && mappedSeries.resolvedHome === homeId) ||
      (awayScore > homeScore && mappedSeries.resolvedHome === awayId);
    normalizedHomeWins = normalizedWinnerIsHome ? 1 : 0;
    normalizedAwayWins = normalizedWinnerIsHome ? 0 : 1;
  }

  const nextTipAt = competition?.date ?? event?.date ?? null;
  const winnerId =
    normalizedHomeWins >= 4
      ? mappedSeries.resolvedHome
      : normalizedAwayWins >= 4
        ? mappedSeries.resolvedAway
        : null;

  return {
    seriesId: mappedSeries.id,
    status: winnerId
      ? "completed"
      : status.completed
        ? "completed"
        : status.inProgress
          ? "in_progress"
          : "scheduled",
    homeWins: normalizedHomeWins,
    awayWins: normalizedAwayWins,
    winnerTeamId: winnerId,
    nextGameAt: nextTipAt,
  };
}

export function useEspnLiveSeriesState(seriesItems, teamsById, allTeams) {
  const [liveStateBySeriesId, setLiveStateBySeriesId] = useState({});

  useEffect(() => {
    const lookup = buildSeriesLookup(seriesItems, teamsById, allTeams);
    if (!Object.keys(lookup).length) {
      setLiveStateBySeriesId({});
      return;
    }

    let active = true;

    async function load() {
      try {
        const dates = listDates(ROUND_1_START, new Date());
        const responses = await Promise.all(
          dates.map(async (date) => {
            const url = `${SCOREBOARD_URL}?seasontype=3&dates=${formatScoreboardDate(date)}&limit=50`;
            const response = await fetch(url);
            if (!response.ok) return [];
            const payload = await response.json();
            return payload?.events ?? [];
          })
        );

        if (!active) return;

        const nextBySeriesId = {};
        responses.flat().forEach((event) => {
          const parsed = parseEspnSeriesSnapshot(event, lookup);
          if (!parsed) return;

        const existing = nextBySeriesId[parsed.seriesId];
        if (!existing) {
          nextBySeriesId[parsed.seriesId] = parsed;
          return;
        }

        const currentGames = (existing.homeWins ?? 0) + (existing.awayWins ?? 0);
        const parsedGames = (parsed.homeWins ?? 0) + (parsed.awayWins ?? 0);
        if (parsedGames > currentGames) {
          nextBySeriesId[parsed.seriesId] = {
            ...existing,
            ...parsed,
          };
          return;
        }

        if (parsedGames === currentGames && parsed.status === "in_progress" && existing.status !== "completed") {
          nextBySeriesId[parsed.seriesId] = {
            ...existing,
            ...parsed,
          };
        }
      });

        setLiveStateBySeriesId(nextBySeriesId);
      } catch {
        if (active) {
          setLiveStateBySeriesId({});
        }
      }
    }

    load();
    const intervalId = window.setInterval(load, 60000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [allTeams, seriesItems, teamsById]);

  return { liveStateBySeriesId };
}

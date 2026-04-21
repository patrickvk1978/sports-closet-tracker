import { useEffect, useState } from "react";

const ROUND_1_START = "2026-04-18";
const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

const ESPN_ABBR_TO_TEAM_ID = {
  ATL: "atl",
  BOS: "bos",
  CHA: "cha",
  CLE: "cle",
  DEN: "den",
  DET: "det",
  GS: "gsw",
  HOU: "hou",
  LAC: "lac",
  LAL: "lal",
  MIA: "mia",
  MIN: "min",
  NYK: "nyk",
  OKC: "okc",
  ORL: "orl",
  PHI: "phi",
  PHX: "phx",
  POR: "por",
  SA: "sas",
  TOR: "tor",
};

function formatScoreboardDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
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
      .filter((item) => item.roundKey === "round_1")
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

function parseScoreboardEvent(event, lookup) {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((entry) => entry.homeAway === "home");
  const away = competitors.find((entry) => entry.homeAway === "away");
  if (!competition || !home || !away) return null;

  const homeId = ESPN_ABBR_TO_TEAM_ID[home.team?.abbreviation ?? ""];
  const awayId = ESPN_ABBR_TO_TEAM_ID[away.team?.abbreviation ?? ""];
  if (!homeId || !awayId) return null;

  const key = [homeId, awayId].sort().join("|");
  const mappedSeries = lookup[key];
  if (!mappedSeries) return null;

  const statusType = competition.status?.type ?? {};
  const homeScore = Number(home.score ?? 0);
  const awayScore = Number(away.score ?? 0);

  let winnerTeamId = null;
  if (statusType.completed && homeScore !== awayScore) {
    const winningEspnTeamId = homeScore > awayScore ? homeId : awayId;
    winnerTeamId =
      mappedSeries.resolvedHome === winningEspnTeamId
        ? mappedSeries.resolvedHome
        : mappedSeries.resolvedAway === winningEspnTeamId
          ? mappedSeries.resolvedAway
          : null;
  }

  return {
    seriesId: mappedSeries.id,
    resolvedHome: mappedSeries.resolvedHome,
    resolvedAway: mappedSeries.resolvedAway,
    status: statusType.completed ? "completed" : statusType.inProgress ? "in_progress" : "scheduled",
    winnerTeamId,
    tipAt: competition.date ?? event.date ?? null,
  };
}

function mergeEventIntoSeriesState(current, parsed, nowTimestamp) {
  const next = current ?? {
    resolvedHome: parsed.resolvedHome,
    resolvedAway: parsed.resolvedAway,
    status: "scheduled",
    homeWins: 0,
    awayWins: 0,
    winnerTeamId: null,
    nextGameAt: null,
  };
  next.resolvedHome = next.resolvedHome ?? parsed.resolvedHome;
  next.resolvedAway = next.resolvedAway ?? parsed.resolvedAway;

  if (parsed.status === "completed" && parsed.winnerTeamId) {
    if (parsed.winnerTeamId === parsed.resolvedHome) {
      next.homeWins += 1;
    } else if (parsed.winnerTeamId === parsed.resolvedAway) {
      next.awayWins += 1;
    }
  }

  const parsedTip = parsed.tipAt ? Date.parse(parsed.tipAt) : 0;
  const currentTip = next.nextGameAt ? Date.parse(next.nextGameAt) : 0;

  if (parsed.status === "in_progress") {
    next.status = "in_progress";
    next.nextGameAt = parsed.tipAt ?? next.nextGameAt;
    return next;
  }

  if (next.status !== "in_progress" && parsed.status === "scheduled" && parsedTip && parsedTip >= nowTimestamp) {
    if (!currentTip || currentTip < nowTimestamp || parsedTip < currentTip) {
      next.nextGameAt = parsed.tipAt;
    }
  }

  return next;
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
        const now = new Date();
        const throughTomorrow = new Date(now);
        throughTomorrow.setDate(throughTomorrow.getDate() + 1);

        const dates = listDates(ROUND_1_START, throughTomorrow);
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

        const aggregated = {};
        const nowTimestamp = Date.now();
        responses
          .flat()
          .map((event) => parseScoreboardEvent(event, lookup))
          .filter(Boolean)
          .sort((a, b) => {
            const aTime = a.tipAt ? Date.parse(a.tipAt) : 0;
            const bTime = b.tipAt ? Date.parse(b.tipAt) : 0;
            return aTime - bTime;
          })
          .forEach((parsed) => {
            aggregated[parsed.seriesId] = mergeEventIntoSeriesState(
              aggregated[parsed.seriesId],
              parsed,
              nowTimestamp
            );
          });

        Object.values(aggregated).forEach((seriesState) => {
          if (seriesState.homeWins >= 4) {
            seriesState.status = "completed";
          } else if (seriesState.awayWins >= 4) {
            seriesState.status = "completed";
          } else if (seriesState.status !== "in_progress") {
            seriesState.status = seriesState.nextGameAt ? "scheduled" : "scheduled";
          }
        });

        const nextBySeriesId = Object.fromEntries(
          Object.entries(aggregated).map(([seriesId, seriesState]) => {
            const winnerTeamId =
              seriesState.homeWins >= 4
                ? seriesState.resolvedHome ?? null
                : seriesState.awayWins >= 4
                  ? seriesState.resolvedAway ?? null
                  : null;

            return [
              seriesId,
              {
                homeTeamId: seriesState.resolvedHome ?? null,
                awayTeamId: seriesState.resolvedAway ?? null,
                status: winnerTeamId ? "completed" : seriesState.status,
                wins: {
                  home: seriesState.homeWins,
                  away: seriesState.awayWins,
                },
                winnerTeamId,
                nextGameAt: seriesState.nextGameAt,
              },
            ];
          })
        );

        setLiveStateBySeriesId(nextBySeriesId);
      } catch {
        if (active) setLiveStateBySeriesId({});
      }
    }

    load();
    const intervalId = window.setInterval(load, 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [allTeams, seriesItems, teamsById]);

  return { liveStateBySeriesId };
}

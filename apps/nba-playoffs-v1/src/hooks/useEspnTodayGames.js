import { useEffect, useState } from "react";

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary";

const ESPN_ABBR_TO_TEAM_ID = {
  ATL: "atl",
  BKN: "bkn",
  BOS: "bos",
  CHA: "cha",
  CLE: "cle",
  DAL: "dal",
  DEN: "den",
  DET: "det",
  GS: "gsw",
  GSW: "gsw",
  HOU: "hou",
  IND: "ind",
  LAC: "lac",
  LAL: "lal",
  MEM: "mem",
  MIA: "mia",
  MIL: "mil",
  MIN: "min",
  NO: "nop",
  NOP: "nop",
  NY: "nyk",
  NYK: "nyk",
  OKC: "okc",
  ORL: "orl",
  PHI: "phi",
  PHX: "phx",
  POR: "por",
  SAC: "sac",
  SA: "sas",
  SAS: "sas",
  TOR: "tor",
  UTA: "uta",
  WAS: "was",
};

function formatScoreboardDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function americanToImpliedPct(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized === 0) return null;
  if (normalized > 0) return Math.round((100 / (normalized + 100)) * 100);
  return Math.round(((-normalized / ((-normalized) + 100)) * 100));
}

function normalizePct(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const scaled = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  const rounded = Math.round(scaled);
  if (rounded <= 0 || rounded >= 100) return null;
  return rounded;
}

function parseEspnGameOdds(competition, homeAbbreviation, awayAbbreviation) {
  const odds = competition?.odds?.[0] ?? null;
  const predictor = competition?.predictor ?? competition?.situation?.lastPlay?.probability ?? null;

  const predictorHomePct =
    predictor?.homeTeam?.gameProjection ??
    predictor?.homeWinPercentage ??
    predictor?.homeWinPercent ??
    null;
  const predictorAwayPct =
    predictor?.awayTeam?.gameProjection ??
    predictor?.awayWinPercentage ??
    predictor?.awayWinPercent ??
    null;

  const homePredictorPct = normalizePct(predictorHomePct);
  const awayPredictorPct = normalizePct(predictorAwayPct);

  if (Number.isFinite(homePredictorPct) && Number.isFinite(awayPredictorPct)) {
    const homePct = homePredictorPct;
    const awayPct = awayPredictorPct;
    return homePct >= awayPct
      ? {
          label: `Matchup Predictor: ${homeAbbreviation} ${homePct}%`,
          homePct,
          awayPct,
          favoriteAbbreviation: homeAbbreviation,
          favoritePct: homePct,
          source: "predictor",
        }
      : {
          label: `Matchup Predictor: ${awayAbbreviation} ${awayPct}%`,
          homePct,
          awayPct,
          favoriteAbbreviation: awayAbbreviation,
          favoritePct: awayPct,
          source: "predictor",
        };
  }

  const homeMoneyline =
    odds?.moneyline?.home?.close?.odds ??
    odds?.moneyline?.home?.open?.odds ??
    odds?.homeTeamOdds?.moneyLine ??
    odds?.homeTeamOdds?.american ??
    odds?.homeMoneyLine ??
    null;
  const awayMoneyline =
    odds?.moneyline?.away?.close?.odds ??
    odds?.moneyline?.away?.open?.odds ??
    odds?.awayTeamOdds?.moneyLine ??
    odds?.awayTeamOdds?.american ??
    odds?.awayMoneyLine ??
    null;

  const homePct = americanToImpliedPct(homeMoneyline);
  const awayPct = americanToImpliedPct(awayMoneyline);
  if (Number.isFinite(homePct) && Number.isFinite(awayPct) && homePct > 0 && awayPct > 0) {
    return homePct >= awayPct
      ? {
          label: `Game odds: ${homeAbbreviation} ${homePct}%`,
          homePct,
          awayPct,
          favoriteAbbreviation: homeAbbreviation,
          favoritePct: homePct,
          source: "moneyline",
        }
      : {
          label: `Game odds: ${awayAbbreviation} ${awayPct}%`,
          homePct,
          awayPct,
          favoriteAbbreviation: awayAbbreviation,
          favoritePct: awayPct,
          source: "moneyline",
        };
  }

  return null;
}

function parseEspnCurrentLine(competition, homeAbbreviation, awayAbbreviation) {
  const odds = competition?.odds?.[0] ?? null;
  const detailLine = odds?.details ?? odds?.displayValue ?? null;
  if (typeof detailLine === "string" && detailLine.trim()) {
    return {
      label: detailLine.trim(),
    };
  }

  const homeMoneyline =
    odds?.moneyline?.home?.close?.odds ??
    odds?.moneyline?.home?.open?.odds ??
    odds?.homeTeamOdds?.moneyLine ??
    odds?.homeTeamOdds?.american ??
    odds?.homeMoneyLine ??
    null;
  const awayMoneyline =
    odds?.moneyline?.away?.close?.odds ??
    odds?.moneyline?.away?.open?.odds ??
    odds?.awayTeamOdds?.moneyLine ??
    odds?.awayTeamOdds?.american ??
    odds?.awayMoneyLine ??
    null;

  const homePct = americanToImpliedPct(homeMoneyline);
  const awayPct = americanToImpliedPct(awayMoneyline);
  if (!Number.isFinite(homePct) || !Number.isFinite(awayPct) || homePct <= 0 || awayPct <= 0) {
    return null;
  }

  return homePct >= awayPct
    ? {
        label: `${homeAbbreviation} favored`,
        homePct,
        awayPct,
        favoriteAbbreviation: homeAbbreviation,
        favoritePct: homePct,
      }
    : {
        label: `${awayAbbreviation} favored`,
        homePct,
        awayPct,
        favoriteAbbreviation: awayAbbreviation,
        favoritePct: awayPct,
      };
}

function parseTodayGame(event) {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((entry) => entry.homeAway === "home");
  const away = competitors.find((entry) => entry.homeAway === "away");
  if (!competition || !home || !away) return null;

  const homeAbbreviation = home.team?.abbreviation ?? null;
  const awayAbbreviation = away.team?.abbreviation ?? null;
  const homeTeamId = ESPN_ABBR_TO_TEAM_ID[homeAbbreviation] ?? null;
  const awayTeamId = ESPN_ABBR_TO_TEAM_ID[awayAbbreviation] ?? null;
  if (!homeTeamId || !awayTeamId) return null;

  const statusType = competition.status?.type ?? {};
  const shortDetail = statusType?.shortDetail ?? event?.status?.type?.shortDetail ?? "";
  const displayClock = competition.status?.displayClock ?? "";
  const period = competition.status?.period ?? null;
  const parsedOdds = parseEspnGameOdds(competition, homeAbbreviation, awayAbbreviation);
  const currentLine = parseEspnCurrentLine(competition, homeAbbreviation, awayAbbreviation);
  const seriesHeadline = competition?.notes?.[0]?.headline ?? null;
  const seriesSummary = competition?.series?.summary ?? null;

  const statusState = statusType?.state ?? null;
  const isCompleted = Boolean(statusType.completed) || statusState === "post";
  const isInProgress = Boolean(statusType.inProgress) || statusState === "in";

  let statusNote = null;
  if (isCompleted) {
    statusNote = "Final";
  } else if (isInProgress) {
    statusNote = shortDetail || (period && displayClock ? `Q${period} ${displayClock}` : "Live");
  }

  return {
    id: event.id,
    status: isCompleted ? "completed" : isInProgress ? "in_progress" : "scheduled",
    tipAt: competition.date ?? event.date ?? null,
    homeTeamId,
    awayTeamId,
    homeAbbreviation,
    awayAbbreviation,
    homeScore: Number(home.score ?? 0),
    awayScore: Number(away.score ?? 0),
    statusNote,
    seriesHeadline,
    seriesSummary,
    marketFavoriteLabel: parsedOdds?.label ?? null,
    currentLineLabel: currentLine?.label ?? null,
    homeWinPct: parsedOdds?.homePct ?? null,
    awayWinPct: parsedOdds?.awayPct ?? null,
    favoriteAbbreviation: parsedOdds?.favoriteAbbreviation ?? null,
    favoritePct: parsedOdds?.favoritePct ?? null,
    oddsSource: parsedOdds?.source ?? null,
  };
}

function findStatisticValue(statistics, name) {
  if (!Array.isArray(statistics)) return null;
  const stat = statistics.find((entry) => entry?.name === name);
  return stat?.value ?? stat?.displayValue ?? null;
}

async function loadGamePredictor(gameId) {
  try {
    const response = await fetch(`${SUMMARY_URL}?event=${gameId}`);
    if (!response.ok) return null;
    const payload = await response.json();
    const predictor = payload?.predictor ?? null;
    if (!predictor) return null;

    const homePct = normalizePct(
      predictor?.homeTeam?.gameProjection ??
      findStatisticValue(predictor?.homeTeam?.statistics, "gameProjection")
    );
    const awayPct = normalizePct(
      predictor?.awayTeam?.gameProjection ??
      findStatisticValue(predictor?.awayTeam?.statistics, "gameProjection")
    );
    if (!Number.isFinite(homePct) || !Number.isFinite(awayPct)) return null;

    return {
      homePct,
      awayPct,
      favoritePct: homePct >= awayPct ? homePct : awayPct,
      source: "predictor",
    };
  } catch {
    return null;
  }
}

export function useEspnTodayGames() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let timerId;

    async function load() {
      if (active) setLoading(true);
      try {
        const today = new Date();
        const url = `${SCOREBOARD_URL}?seasontype=3&dates=${formatScoreboardDate(today)}&limit=50`;
        const response = await fetch(url);
        if (!response.ok) {
          if (active) {
            setGames([]);
            setLoading(false);
          }
          return;
        }
        const payload = await response.json();
        if (!active) return;
        const parsedGames = (payload?.events ?? []).map(parseTodayGame).filter(Boolean);
        const predictorRows = await Promise.all(
          parsedGames.map(async (game) => ({
            id: game.id,
            predictor: await loadGamePredictor(game.id),
          }))
        );
        if (!active) return;
        const predictorById = Object.fromEntries(
          predictorRows
            .filter((row) => row.predictor)
            .map((row) => [row.id, row.predictor])
        );
        setGames(
          parsedGames.map((game) => {
            const predictor = predictorById[game.id] ?? null;
            if (!predictor) return game;
            return {
              ...game,
              homeWinPct: predictor.homePct,
              awayWinPct: predictor.awayPct,
              marketFavoriteLabel:
                predictor.homePct >= predictor.awayPct
                  ? `Matchup Predictor: ${game.homeAbbreviation} ${predictor.homePct}%`
                  : `Matchup Predictor: ${game.awayAbbreviation} ${predictor.awayPct}%`,
              favoriteAbbreviation:
                predictor.homePct >= predictor.awayPct ? game.homeAbbreviation : game.awayAbbreviation,
              favoritePct: Math.max(predictor.homePct, predictor.awayPct),
              oddsSource: predictor.source,
            };
          })
        );
        if (active) setLoading(false);
      } catch {
        if (active) {
          setGames([]);
          setLoading(false);
        }
      }
    }

    load();
    timerId = window.setInterval(load, 60_000);

    return () => {
      active = false;
      if (timerId) window.clearInterval(timerId);
    };
  }, []);

  return { games, loading };
}

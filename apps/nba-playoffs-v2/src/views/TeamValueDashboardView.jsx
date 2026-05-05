import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { useEspnTodayGames, useEspnYesterdayGames } from "../hooks/useEspnTodayGames";
import {
  buildTeamValueStandingsWithMonteCarlo,
  getRoundOneTeamsFromData,
} from "../lib/teamValuePreview";
import { buildTeamValueReports } from "../lib/teamValueReports";
import { getClinchingBonus, getDisplayRankFromValue } from "../lib/teamValueGame";

function formatMemberLabel(member, currentUserId) {
  if (!member) return "Unknown";
  const base = member.displayName ?? member.name ?? "Unknown";
  return member.id === currentUserId ? "You" : base;
}

function buildRankMovement(currentPlace, baselineRank) {
  if (!Number.isFinite(Number(currentPlace)) || !Number.isFinite(Number(baselineRank))) {
    return { label: "—", direction: "flat" };
  }
  const delta = Number(baselineRank) - Number(currentPlace);
  if (delta > 0) return { label: `▲${delta}`, direction: "up" };
  if (delta < 0) return { label: `▼${Math.abs(delta)}`, direction: "down" };
  return { label: "—", direction: "flat" };
}

function formatWinProbabilityDelta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { label: "—", direction: "flat" };
  if (Math.abs(numeric) < 0.05) return { label: "Even", direction: "flat" };
  return {
    label: `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}`,
    direction: numeric > 0 ? "up" : "down",
  };
}

function buildDashboardStandingsRows(standings, currentUserId) {
  return standings;
}

function sameCalendarDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatGameTime(seriesItem, now) {
  if (seriesItem.status === "in_progress") return "Live now";
  const tipAt = seriesItem.schedule?.nextGame?.tipAt ?? seriesItem.schedule?.lockAt ?? null;
  if (!tipAt) return "Time TBD";

  const tipDate = new Date(tipAt);
  if (Number.isNaN(tipDate.getTime())) return "Time TBD";

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(tipDate);

  if (sameCalendarDay(tipDate, now)) return timeLabel;

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
  }).format(tipDate);

  return `${dateLabel}, ${timeLabel}`;
}

function buildFavoriteLabel(seriesItem) {
  const homePct = Number(seriesItem.market?.homeTeamPct ?? 50);
  const awayPct = 100 - homePct;
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId ?? "HOME";
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId ?? "AWAY";
  return homePct >= awayPct ? `${homeAbbr} ${Math.round(homePct)}%` : `${awayAbbr} ${Math.round(awayPct)}%`;
}

function formatSeriesStatus(seriesItem) {
  const conference = seriesItem.conference === "west" ? "West" : "East";
  const roundLabel =
    seriesItem.roundKey === "round_1"
      ? "1st Round"
      : seriesItem.roundKey === "semifinals"
        ? "Conference Semifinals"
        : seriesItem.roundKey === "conference_finals"
          ? "Conference Finals"
          : seriesItem.roundKey === "finals"
            ? "Finals"
            : "Playoff";
  const homeWins = Number(seriesItem.wins?.home ?? 0);
  const awayWins = Number(seriesItem.wins?.away ?? 0);
  const nextGameNumber = Math.min(homeWins + awayWins + 1, 7);
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;

  if (homeWins === awayWins) {
    return `${conference} ${roundLabel} · Game ${nextGameNumber} · Series tied ${homeWins}-${awayWins}`;
  }

  const leader = homeWins > awayWins ? homeAbbr : awayAbbr;
  const leaderWins = Math.max(homeWins, awayWins);
  const trailingWins = Math.min(homeWins, awayWins);
  return `${conference} ${roundLabel} · Game ${nextGameNumber} · ${leader} leads series ${leaderWins}-${trailingWins}`;
}

function buildUpdatedSeriesStatus(seriesItem, game) {
  if (!seriesItem) return "NBA Playoffs";
  if (game?.status !== "completed") return formatSeriesStatus(seriesItem);

  const homeTeamId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayTeamId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const homeWins = Number(seriesItem.wins?.home ?? 0);
  const awayWins = Number(seriesItem.wins?.away ?? 0);
  const homeScore = Number(game?.homeScore ?? 0);
  const awayScore = Number(game?.awayScore ?? 0);
  const homeIncrement = homeScore > awayScore && homeTeamId === game.homeTeamId ? 1 : 0;
  const awayIncrement = awayScore > homeScore && awayTeamId === game.awayTeamId ? 1 : 0;

  return formatSeriesStatus({
    ...seriesItem,
    wins: {
      home: homeWins + homeIncrement,
      away: awayWins + awayIncrement,
    },
  });
}

function splitOddsLabel(label) {
  if (!label) {
    return {
      display: "Matchup Predictor soon",
      source: null,
    };
  }

  if (label.startsWith("Matchup Predictor: ")) {
    return {
      display: label.replace("Matchup Predictor: ", ""),
      source: "ESPN Matchup Predictor",
    };
  }

  if (label.startsWith("Game odds: ")) {
    return {
      display: label.replace("Game odds: ", ""),
      source: "ESPN Game Odds",
    };
  }

  if (label.startsWith("Board lean: ")) {
    return {
      display: label.replace("Board lean: ", ""),
      source: "Board implications",
    };
  }

  return {
    display: label,
    source: null,
  };
}

function buildDisplayLine(game, oddsLabel) {
  if (game?.currentLineLabel) return game.currentLineLabel;
  if (game?.status === "in_progress" && oddsLabel?.source === "predictor" && oddsLabel?.display) {
    return `ESPN Win Probability: ${oddsLabel.display}`;
  }
  return "Odds soon";
}

function buildOnTapRows(todayGames, boardImplicationRows, series, now) {
  const implicationBySeriesId = Object.fromEntries(boardImplicationRows.map((row) => [row.id, row]));
  const seriesByPair = Object.fromEntries(
    series.map((seriesItem) => {
      const key = [seriesItem.homeTeam?.id ?? seriesItem.homeTeamId, seriesItem.awayTeam?.id ?? seriesItem.awayTeamId].sort().join("|");
      return [key, seriesItem];
    })
  );

  return todayGames
    .filter((game) => {
      if (game.status === "completed") return false;
      if (game.status === "in_progress") return true;
      if (!game.tipAt) return false;
      const tipDate = new Date(game.tipAt);
      return !Number.isNaN(tipDate.getTime()) && sameCalendarDay(tipDate, now);
    })
    .sort((a, b) => {
      if (a.status === "in_progress" && b.status !== "in_progress") return -1;
      if (b.status === "in_progress" && a.status !== "in_progress") return 1;
      return new Date(a.tipAt ?? 0) - new Date(b.tipAt ?? 0);
    })
    .map((game) => {
      const pairKey = [game.homeTeamId, game.awayTeamId].sort().join("|");
      const matchingSeries = seriesByPair[pairKey] ?? null;
      const implication = matchingSeries ? implicationBySeriesId[matchingSeries.id] ?? null : null;
      const pseudoSeries = {
        status: game.status,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeTeam: { abbreviation: game.homeAbbreviation },
        awayTeam: { abbreviation: game.awayAbbreviation },
        schedule: { nextGame: { tipAt: game.tipAt }, lockAt: game.tipAt },
        market: implication
          ? {
              homeTeamPct: implication.marketLean,
            }
          : null,
      };
      const oddsLabel = splitOddsLabel(
        game.marketFavoriteLabel ??
        (implication ? `Board lean: ${buildFavoriteLabel(pseudoSeries)}` : "Matchup Predictor soon")
      );

      return {
        id: matchingSeries?.id ?? game.id,
        analysisPath: matchingSeries
          ? game.status === "completed"
            ? `/reports/yesterday-recap?day=today#game-recap-${game.id}`
            : `/reports/board-implications#analysis-${matchingSeries.id}`
          : "/reports/board-implications",
        analysisLabel: game.status === "completed" ? "Recap" : "Read",
        teamIds: [game.homeTeamId, game.awayTeamId],
        matchupLabel: `${game.awayAbbreviation} at ${game.homeAbbreviation}`,
        timeLabel: formatGameTime(pseudoSeries, now),
        status: game.status,
        statusNote: game.statusNote,
        scoreLabel:
          game.status === "scheduled"
            ? null
            : `${game.awayAbbreviation} ${game.awayScore} · ${game.homeAbbreviation} ${game.homeScore}`,
        seriesStatus: matchingSeries ? buildUpdatedSeriesStatus(matchingSeries, game) : "NBA Playoffs",
        currentLineLabel: buildDisplayLine(game, oddsLabel),
        favoriteLabel: oddsLabel.display,
        boardLean: implication?.preferredTeam ?? "Balanced",
        oddsSource: oddsLabel.source,
        awayAbbreviation: game.awayAbbreviation,
        homeAbbreviation: game.homeAbbreviation,
        awayLogo: game.awayTeamLogo,
        homeLogo: game.homeTeamLogo,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        rawTipAt: game.tipAt ?? null,
      };
    });
}

function buildCompletedImpactRows(games, allAssignmentsByUser, currentUserId, series) {
  const assignments = allAssignmentsByUser?.[currentUserId] ?? {};
  const seriesByPair = Object.fromEntries(
    (series ?? []).map((seriesItem) => {
      const key = [seriesItem.homeTeam?.id ?? seriesItem.homeTeamId, seriesItem.awayTeam?.id ?? seriesItem.awayTeamId]
        .sort()
        .join("|");
      return [key, seriesItem];
    })
  );
  return games
    .filter((game) => game.status === "completed")
    .sort((a, b) => new Date(a.tipAt ?? 0) - new Date(b.tipAt ?? 0))
    .map((game) => {
      const homeWon = Number(game.homeScore ?? 0) > Number(game.awayScore ?? 0);
      const winnerTeamId = homeWon ? game.homeTeamId : game.awayTeamId;
      const loserTeamId = homeWon ? game.awayTeamId : game.homeTeamId;
      const winnerAbbreviation = homeWon ? game.homeAbbreviation : game.awayAbbreviation;
      const loserAbbreviation = homeWon ? game.awayAbbreviation : game.homeAbbreviation;
      const winnerScore = homeWon ? game.homeScore : game.awayScore;
      const loserScore = homeWon ? game.awayScore : game.homeScore;
      const winnerLogo = homeWon ? game.homeTeamLogo : game.awayTeamLogo;
      const loserLogo = homeWon ? game.awayTeamLogo : game.homeTeamLogo;
      const teamValue = Number(assignments?.[winnerTeamId] ?? 0);
      const displayRank = getDisplayRankFromValue(teamValue);
      const pairKey = [game.homeTeamId, game.awayTeamId].sort().join("|");
      const matchingSeries = seriesByPair[pairKey] ?? null;
      const clinchedSeries = matchingSeries?.status === "completed" && matchingSeries?.winnerTeamId === winnerTeamId;
      const clinchingBonus = clinchedSeries ? getClinchingBonus(teamValue, matchingSeries.roundKey) : 0;
      const recapPath = `/reports/yesterday-recap?day=today#game-recap-${game.id}`;
      const updatedHomeWins = Number(matchingSeries?.wins?.home ?? 0) + (homeWon ? 1 : 0);
      const updatedAwayWins = Number(matchingSeries?.wins?.away ?? 0) + (homeWon ? 0 : 1);
      const seriesSummary = clinchedSeries
        ? `${winnerAbbreviation} wins series ${Math.max(updatedHomeWins, updatedAwayWins)}-${Math.min(updatedHomeWins, updatedAwayWins)}`
        : matchingSeries
          ? buildUpdatedSeriesStatus(matchingSeries, game)
          : "Final";

      return {
        id: `${game.id}-impact`,
        winnerAbbreviation,
        loserAbbreviation,
        winnerScore,
        loserScore,
        winnerLogo,
        loserLogo,
        displayRank,
        pointsPerWin: teamValue,
        pointsGained: teamValue + clinchingBonus,
        clinchingBonus,
        gameLabel: game.statusNote ?? "Final",
        recapPath,
        seriesSummary,
      };
    })
    .filter((row) => row.pointsPerWin > 0);
}

function buildFuturePressureRows(assetRows, todayRows) {
  const teamsPlayingToday = new Set(
    todayRows.flatMap((row) => row.teamIds ?? [])
  );
  const rows = assetRows
    .filter((row) => !teamsPlayingToday.has(row.id))
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      title: row.teamLabel,
      body: `${row.expectedPoints} expected points left.`,
      chip: `${row.yourValue} pts on your board`,
    }));

  if (rows.length) return rows;

  return [
    {
      id: "future-watch",
      title: "The next turn of the bracket is the real watch",
      body: "Once today’s games settle, the bigger pressure question becomes which advancing teams reopen separation paths for you versus the room. This lane will get sharper as those next-round paths narrow.",
      chip: "Next wave",
    },
  ];
}

function buildCurrentImplicationRows(todayRows) {
  if (!todayRows.length) {
    return [
      {
        id: "no-games-today",
        eyebrow: "Off day",
        title: "Nothing urgent lands today",
        body: "The room stays mostly in place until the next slate tips.",
      },
    ];
  }

  return todayRows.slice(0, 3).map((row, index) => ({
    id: row.id,
    eyebrow: row.matchupLabel,
    title:
      row.boardLean === "Balanced"
        ? "Mostly even"
        : `${row.boardLean} lean`,
    body:
      row.boardLean === "Balanced"
        ? "More watch than root-for."
        : index === 0
          ? "Best swing on the board right now."
          : "Still a live swing for your board.",
  }));
}

export default function TeamValueDashboardView() {
  const { profile } = useAuth();
  const { memberList } = usePool();
  const { seriesByRound, teamsById, series } = usePlayoffData();
  const { games: todayGames } = useEspnTodayGames();
  const { games: yesterdayGames } = useEspnYesterdayGames();
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const {
    allAssignmentsByUser,
    syncedBoardCount,
    syncedUserIds,
    hasLoadedInitialBoardState,
  } = useTeamValueBoard(playoffTeams);
  const currentUserId = profile?.id ?? null;
  const syncedUserIdSet = useMemo(() => new Set(syncedUserIds), [syncedUserIds]);
  const trustedMembers = useMemo(
    () => memberList.filter((member) => syncedUserIdSet.has(member.id)),
    [memberList, syncedUserIdSet]
  );
  const standings = buildTeamValueStandingsWithMonteCarlo(trustedMembers, allAssignmentsByUser, series, playoffTeams);
  const currentStanding = standings.find((member) => member.id === currentUserId) ?? null;
  const reportState = buildTeamValueReports({
    profileId: currentUserId,
    memberList,
    allAssignmentsByUser,
    seriesByRound,
    teamsById,
    series,
  });
  const boardImplicationRows = reportState.reports["board-implications"]?.rows ?? [];
  const assetRows = reportState.reports.assets?.rows ?? [];
  const now = useMemo(() => new Date(), []);
  const recentCompletedGames = useMemo(() => {
    const combined = [...(yesterdayGames ?? []), ...(todayGames ?? [])];
    const byId = new Map();
    combined.forEach((game) => {
      if (!game?.id) return;
      byId.set(game.id, game);
    });
    return [...byId.values()];
  }, [todayGames, yesterdayGames]);
  const completedImpactRows = useMemo(
    () => buildCompletedImpactRows(recentCompletedGames, allAssignmentsByUser, currentUserId, series),
    [allAssignmentsByUser, currentUserId, recentCompletedGames, series]
  );
  const onTapRows = useMemo(() => buildOnTapRows(todayGames, boardImplicationRows, series, now), [boardImplicationRows, now, series, todayGames]);
  const hasLiveGames = onTapRows.some((row) => row.status === "in_progress");
  const firstTipAt = useMemo(() => {
    const tips = onTapRows
      .map((row) => row.rawTipAt)
      .filter(Boolean)
      .map((tipAt) => new Date(tipAt))
      .filter((tipDate) => !Number.isNaN(tipDate.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());
    return tips[0] ?? null;
  }, [onTapRows]);
  const showTodayFrontAndCenter = useMemo(() => {
    if (hasLiveGames) return true;
    if (!firstTipAt) return false;
    return now.getTime() >= firstTipAt.getTime() - 4 * 60 * 60 * 1000;
  }, [firstTipAt, hasLiveGames, now]);
  const currentImplicationRows = useMemo(() => buildCurrentImplicationRows(onTapRows), [onTapRows]);
  const futurePressureRows = useMemo(() => buildFuturePressureRows(assetRows, onTapRows), [assetRows, onTapRows]);
  const dashboardStandingsRows = useMemo(
    () => buildDashboardStandingsRows(standings, currentUserId),
    [currentUserId, standings]
  );
  const baselineRankById = useMemo(
    () =>
      Object.fromEntries(
        [...dashboardStandingsRows]
          .sort((a, b) => (b.baselineWinProbability ?? 0) - (a.baselineWinProbability ?? 0))
          .map((member, index) => [member.id, index + 1])
      ),
    [dashboardStandingsRows]
  );
  const currentRoundLabel = series.find((item) => item.status === "in_progress") ? "Current-round implications" : "Where the first-round pressure sits";
  const implicationReportPath = reportState.visibleReportKeys.includes("board-implications")
    ? "/reports/board-implications"
    : "/reports/rooting";
  const canTrustStandings = hasLoadedInitialBoardState && syncedBoardCount >= 2;

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="nba-dashboard-main-layout">
          <div className="nba-dashboard-primary-column">
            {showTodayFrontAndCenter ? (
              <article className="detail-card inset-card nba-dashboard-impact-card">
                <div className="nba-dashboard-card-head">
                  <span className="micro-label">What’s On Tap</span>
                </div>
                <div className="nba-dashboard-impact-grid">
                  {onTapRows.map((row) => (
                    <article className="nba-dashboard-impact-row nba-dashboard-live-game-row" key={row.id}>
                      <div className="nba-dashboard-impact-topline">
                        {row.status === "in_progress" ? (
                          <span className="nba-dashboard-live-chip">Live</span>
                        ) : (
                          <span className="nba-dashboard-impact-final is-tipoff">{row.timeLabel}</span>
                        )}
                        <span className="nba-dashboard-impact-clock">{row.status === "in_progress" ? row.statusNote ?? "Live" : row.seriesStatus.split("·")[1]?.trim() ?? row.seriesStatus}</span>
                      </div>
                      {row.status === "scheduled" ? (
                        <>
                          <div className="nba-dashboard-impact-previewline">
                            <div className="nba-dashboard-impact-team">
                              {row.awayLogo ? <img alt={`${row.awayAbbreviation} logo`} src={row.awayLogo} /> : null}
                              <strong>{row.awayAbbreviation}</strong>
                            </div>
                            <span className="nba-dashboard-impact-def">vs</span>
                            <div className="nba-dashboard-impact-team is-loser">
                              {row.homeLogo ? <img alt={`${row.homeAbbreviation} logo`} src={row.homeLogo} /> : null}
                              <strong>{row.homeAbbreviation}</strong>
                            </div>
                          </div>
                          <div className="nba-dashboard-impact-bonus">{row.seriesStatus}</div>
                        </>
                      ) : (
                        <>
                          <div className="nba-dashboard-impact-scoreline">
                            <div className="nba-dashboard-impact-team">
                              {row.awayLogo ? <img alt={`${row.awayAbbreviation} logo`} src={row.awayLogo} /> : null}
                              <strong>{row.awayAbbreviation}</strong>
                            </div>
                            <strong className="nba-dashboard-impact-score">{row.awayScore}</strong>
                            <span className="nba-dashboard-impact-def">·</span>
                            <strong className="nba-dashboard-impact-score">{row.homeScore}</strong>
                            <div className="nba-dashboard-impact-team is-loser">
                              {row.homeLogo ? <img alt={`${row.homeAbbreviation} logo`} src={row.homeLogo} /> : null}
                              <strong>{row.homeAbbreviation}</strong>
                            </div>
                          </div>
                          <div className="nba-dashboard-impact-bonus">{row.seriesStatus}</div>
                        </>
                      )}
                      <div className="nba-dashboard-on-tap-impact-meta">
                        <span>{row.currentLineLabel}</span>
                        <span>{row.boardLean === "Balanced" ? "Even board read" : `${row.boardLean} board lean`}</span>
                      </div>
                      <Link className="secondary-button full nba-dashboard-impact-button" to={row.analysisPath}>
                        {row.analysisLabel}
                      </Link>
                    </article>
                  ))}
                </div>
              </article>
            ) : completedImpactRows.length ? (
              <article className="detail-card inset-card nba-dashboard-impact-card">
                <div className="nba-dashboard-card-head">
                  <span className="micro-label">Recent score impact</span>
                </div>
                <div className="nba-dashboard-impact-grid">
                  {completedImpactRows.map((row) => (
                    <article className="nba-dashboard-impact-row" key={row.id}>
                      <div className="nba-dashboard-impact-topline">
                        <span className="nba-dashboard-impact-final">{row.gameLabel}</span>
                      </div>
                      <div className="nba-dashboard-impact-scoreline">
                        <div className="nba-dashboard-impact-team">
                          {row.winnerLogo ? <img alt={`${row.winnerAbbreviation} logo`} src={row.winnerLogo} /> : null}
                          <strong>{row.winnerAbbreviation}</strong>
                        </div>
                        <strong className="nba-dashboard-impact-score">{row.winnerScore}</strong>
                        <span className="nba-dashboard-impact-def">def.</span>
                        <strong className="nba-dashboard-impact-score">{row.loserScore}</strong>
                        <div className="nba-dashboard-impact-team is-loser">
                          {row.loserLogo ? <img alt={`${row.loserAbbreviation} logo`} src={row.loserLogo} /> : null}
                          <strong>{row.loserAbbreviation}</strong>
                        </div>
                      </div>
                      <div className="nba-dashboard-impact-meta">
                        <span>
                          <small>Your rank</small>
                          <strong>{row.displayRank ? `#${row.displayRank}` : "—"}</strong>
                        </span>
                        <span>
                          <small>Points per win</small>
                          <strong>{row.pointsPerWin}</strong>
                        </span>
                      </div>
                      {row.clinchingBonus > 0 ? (
                        <div className="nba-dashboard-impact-bonus">Includes +{row.clinchingBonus} series bonus</div>
                      ) : null}
                      <div className="nba-dashboard-impact-points">+{row.pointsGained}</div>
                      <Link className="secondary-button full nba-dashboard-impact-button" to={row.recapPath}>
                        Recap
                      </Link>
                    </article>
                  ))}
                </div>
              </article>
            ) : null}

            <article className="detail-card inset-card nba-dashboard-live-standings-card">
              <div className="nba-dashboard-card-head">
                <h3>Standings</h3>
              </div>
              {!hasLoadedInitialBoardState ? (
                <div className="nba-dashboard-empty-state">
                  <strong>Loading live standings.</strong>
                  <p>We’re syncing the room first so this card doesn’t jump through an in-between state.</p>
                </div>
              ) : canTrustStandings ? (
                <>
                  <div className="leaderboard-table nba-dashboard-leaderboard-table">
                      <div className="leaderboard-head nba-dashboard-leaderboard-head">
                        <span>Player</span>
                        <span>Pts</span>
                        <span>Back</span>
                        <span>Move</span>
                        <span>Win%</span>
                        <span>Trend</span>
                      </div>
                    {dashboardStandingsRows.map((member) => {
                      const movement = buildRankMovement(member.place, baselineRankById[member.id]);
                      const winProbabilityDelta = formatWinProbabilityDelta(member.winProbabilityDelta);
                      return (
                      <div
                        className={`leaderboard-row nba-dashboard-leaderboard-row ${member.id === currentUserId ? "is-current" : ""}`}
                        key={member.id}
                      >
                        <div className="leaderboard-player">
                          <strong>{member.place}</strong>
                          <span>{formatMemberLabel(member, currentUserId)}</span>
                        </div>
                        <span className="nba-dashboard-points-cell">{member.summary.totalPoints}</span>
                        <span className="nba-dashboard-back-cell">{member.pointsBack}</span>
                        <span className={`nba-dashboard-move-indicator is-${movement.direction}`}>{movement.label}</span>
                        <span className="nba-dashboard-winprob-cell">{member.winProbability}%</span>
                        <span className={`nba-dashboard-trend-delta is-${winProbabilityDelta.direction}`}>{winProbabilityDelta.label}</span>
                      </div>
                    )})}
                  </div>
                  {currentStanding ? (
                    <p className="nba-dashboard-standings-note">
                      The last column shows how each board’s title odds have moved since lock. You are currently in <strong>{currentStanding.place}</strong> with <strong>{currentStanding.winProbability}%</strong> win probability.
                    </p>
                  ) : null}
                  <Link className="nba-dashboard-standings-link" to="/scoring">
                    How scoring works
                  </Link>
                </>
              ) : (
                <div className="nba-dashboard-empty-state">
                  <strong>Standings are still syncing.</strong>
                  <p>Only {syncedBoardCount} live board{syncedBoardCount === 1 ? "" : "s"} are synced to the server right now, so the room read would be misleading.</p>
                </div>
              )}
            </article>
          </div>

          <aside className="nba-dashboard-side-rail">
            <article className="detail-card inset-card nba-dashboard-on-tap-card nba-dashboard-on-tap-side-card">
              <div className="nba-dashboard-card-head">
                <h3>{showTodayFrontAndCenter ? "Recent finals" : "What’s On Tap"}</h3>
                <Link className="secondary-button" to={implicationReportPath}>
                  Today's Briefing
                </Link>
              </div>

              {(showTodayFrontAndCenter ? completedImpactRows : onTapRows).length ? (
                <div className="nba-dashboard-on-tap-compact-grid">
                  {(showTodayFrontAndCenter ? completedImpactRows : onTapRows).map((row) =>
                    showTodayFrontAndCenter ? (
                      <article className="nba-dashboard-on-tap-compact-card" key={row.id}>
                        <div className="nba-dashboard-on-tap-compact-top">
                          <span className="nba-dashboard-on-tap-live-status">Final</span>
                        </div>
                        <strong className="nba-dashboard-on-tap-compact-title">
                          {row.winnerAbbreviation} {row.winnerScore} · {row.loserAbbreviation} {row.loserScore}
                        </strong>
                        <p className="nba-dashboard-on-tap-compact-series">{row.gameLabel}</p>
                        <div className="nba-dashboard-on-tap-compact-summary">{row.seriesSummary}</div>
                        <Link className="secondary-button full" to={row.recapPath}>
                          Recap
                        </Link>
                      </article>
                    ) : (
                      <article className="nba-dashboard-on-tap-compact-card" key={row.id}>
                        <div className="nba-dashboard-on-tap-compact-top">
                          {row.status === "in_progress" ? (
                            <span className="nba-dashboard-live-chip">Live</span>
                          ) : (
                            <span className="nba-dashboard-on-tap-compact-time">{row.timeLabel}</span>
                          )}
                          {row.status !== "scheduled" ? (
                            <span className="nba-dashboard-on-tap-live-status">{row.statusNote ?? (row.status === "completed" ? "Final" : "Live")}</span>
                          ) : null}
                        </div>
                        <strong className="nba-dashboard-on-tap-compact-title">
                          {row.status === "scheduled" ? row.matchupLabel : row.scoreLabel}
                        </strong>
                        <p className="nba-dashboard-on-tap-compact-series">{row.seriesStatus}</p>
                        {row.status === "scheduled" ? (
                          <div className="nba-dashboard-on-tap-compact-meta">
                            <span>{row.currentLineLabel}</span>
                            <span>{row.boardLean === "Balanced" ? "Even board read" : `${row.boardLean} board lean`}</span>
                          </div>
                        ) : null}
                        <Link className="secondary-button full" to={row.analysisPath}>
                          {row.analysisLabel}
                        </Link>
                      </article>
                    )
                  )}
                </div>
              ) : (
                <div className="nba-dashboard-empty-state">
                  <strong>No games tip today.</strong>
                  <p>The next useful move is checking where your board is most exposed before the next live swing arrives.</p>
                </div>
              )}
            </article>

            <article className="detail-card inset-card nba-dashboard-link-card nba-dashboard-yesterday-card">
              <span className="micro-label">Yesterday's Recap</span>
              <strong>See how the pool moved</strong>
              <Link className="secondary-button full" to="/reports/yesterday-recap">
                Yesterday's Recap
              </Link>
            </article>
          </aside>
        </div>
      </section>
    </div>
  );
}

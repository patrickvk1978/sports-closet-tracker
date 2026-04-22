import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { useEspnTodayGames } from "../hooks/useEspnTodayGames";
import {
  buildTeamValueStandingsWithOdds,
  getRoundOneTeamsFromData,
} from "../lib/teamValuePreview";
import { buildTeamValueReports } from "../lib/teamValueReports";

function formatMemberLabel(member, currentUserId) {
  if (!member) return "Unknown";
  const base = member.displayName ?? member.name ?? "Unknown";
  return member.id === currentUserId ? "You" : base;
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
  const roundLabel = seriesItem.roundKey === "round_1" ? "1st Round" : "Playoff";
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
          ? `/reports/board-implications#analysis-${matchingSeries.id}`
          : "/reports/board-implications",
        teamIds: [game.homeTeamId, game.awayTeamId],
        matchupLabel: `${game.awayAbbreviation} at ${game.homeAbbreviation}`,
        timeLabel: formatGameTime(pseudoSeries, now),
        seriesStatus: matchingSeries ? formatSeriesStatus(matchingSeries) : "Playoff game",
        currentLineLabel: game.currentLineLabel ?? "Line TBD",
        favoriteLabel: oddsLabel.display,
        boardLean: implication?.preferredTeam ?? "Balanced",
      };
    });
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
      title: `${row.teamLabel} still looms beyond today`,
      body: `${row.teamLabel} is carrying ${row.yourValue} of your board, with ${row.expectedPoints} expected points still available from here.`,
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
        title: "Nothing urgent is landing today",
        body: "With no games on the slate, this lane becomes a quiet room-read rather than a rooting guide. The useful move is checking which teams could matter most once the next window opens.",
        chip: "Off day",
      },
    ];
  }

  return todayRows.slice(0, 3).map((row, index) => ({
    id: row.id,
    title:
      index === 0
        ? `${row.matchupLabel} is the first place today can move`
        : `${row.matchupLabel} stays on the live board today`,
    body: `${row.seriesStatus}. ${row.boardLean === "Balanced" ? "Your board is relatively balanced here, so this is more room texture than a true rooting order." : `${row.boardLean} is your current board lean in this matchup.`}`,
    chip: row.boardLean === "Balanced" ? row.matchupLabel : `${row.boardLean} lean`,
  }));
}

export default function TeamValueDashboardView() {
  const { profile } = useAuth();
  const { memberList } = usePool();
  const { seriesByRound, teamsById, series } = usePlayoffData();
  const { games: todayGames } = useEspnTodayGames();
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
  const standings = buildTeamValueStandingsWithOdds(trustedMembers, allAssignmentsByUser, series);
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
  const onTapRows = useMemo(() => buildOnTapRows(todayGames, boardImplicationRows, series, now), [boardImplicationRows, now, series, todayGames]);
  const currentImplicationRows = useMemo(() => buildCurrentImplicationRows(onTapRows), [onTapRows]);
  const futurePressureRows = useMemo(() => buildFuturePressureRows(assetRows, onTapRows), [assetRows, onTapRows]);
  const dashboardStandingsRows = useMemo(
    () => buildDashboardStandingsRows(standings, currentUserId),
    [currentUserId, standings]
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
            <article className="detail-card inset-card nba-dashboard-on-tap-card">
              <div className="nba-dashboard-card-head">
                <div>
                  <h3>What’s On Tap</h3>
                </div>
                <Link className="secondary-button" to={implicationReportPath}>
                  Open Today&apos;s Briefing
                </Link>
              </div>

              {onTapRows.length ? (
                <div className="nba-dashboard-on-tap-list">
                  {onTapRows.map((row) => (
                    <article className="nba-dashboard-on-tap-row" key={row.id}>
                      <div className="nba-dashboard-on-tap-time">
                        <strong>{row.timeLabel}</strong>
                      </div>
                      <div className="nba-dashboard-on-tap-copy">
                        <strong>{row.matchupLabel}</strong>
                        <p>{row.seriesStatus}</p>
                        <div className="nba-dashboard-on-tap-meta">
                          <span><strong>Line:</strong> {row.currentLineLabel}</span>
                          <span><strong>Predictor:</strong> {row.favoriteLabel}</span>
                          <span><strong>Board lean:</strong> {row.boardLean}</span>
                        </div>
                      </div>
                      <div className="nba-dashboard-on-tap-action">
                        <Link className="secondary-button full" to={row.analysisPath}>
                          Detailed Analysis
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="nba-dashboard-empty-state">
                  <strong>No games tip today.</strong>
                  <p>The next useful move is checking where your board is most exposed before the next live swing arrives.</p>
                </div>
              )}
            </article>

            <article className="detail-card inset-card nba-dashboard-live-standings-card">
              <div className="nba-dashboard-card-head">
                <div>
                  <span className="micro-label">Room right now</span>
                  <h3>Live standings snapshot</h3>
                </div>
                <Link className="secondary-button" to="/standings">
                  Full standings
                </Link>
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
                      <span>Live</span>
                      <span>Win%</span>
                      <span>Back</span>
                    </div>
                    {dashboardStandingsRows.map((member) => (
                      <div
                        className={`leaderboard-row nba-dashboard-leaderboard-row ${member.id === currentUserId ? "is-current" : ""}`}
                        key={member.id}
                      >
                        <div className="leaderboard-player">
                          <strong>{member.place}</strong>
                          <span>{formatMemberLabel(member, currentUserId)}</span>
                        </div>
                        <span>{member.summary.totalPoints}</span>
                        <span>{member.liveValueRemaining}</span>
                        <span>{member.winProbability}%</span>
                        <span>{member.pointsBack}</span>
                      </div>
                    ))}
                  </div>
                  {currentStanding ? (
                    <p className="nba-dashboard-standings-note">
                      You are currently in <strong>{currentStanding.place}</strong> with <strong>{currentStanding.winProbability}%</strong> win probability and <strong>{currentStanding.liveValueRemaining}</strong> live value still in play.
                    </p>
                  ) : null}
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
            <article className="detail-card inset-card nba-dashboard-link-card is-primary-link">
              <span className="micro-label">{currentRoundLabel}</span>
              <strong>Where today can help you fastest</strong>
              <div className="nba-dashboard-implication-stack">
                {currentImplicationRows.map((item) => (
                  <div className="nba-dashboard-implication-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                    <span className="chip subtle-chip">{item.chip}</span>
                  </div>
                ))}
              </div>
              <Link className="secondary-button full" to={implicationReportPath}>
                Open Board Implications
              </Link>
            </article>

            <article className="detail-card inset-card nba-dashboard-link-card is-secondary-link">
              <span className="micro-label">Potential future implications</span>
              <strong>What could become more important after tonight</strong>
              <div className="nba-dashboard-implication-stack">
                {futurePressureRows.map((item) => (
                  <div className="nba-dashboard-implication-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                    <span className="chip subtle-chip">{item.chip}</span>
                  </div>
                ))}
              </div>
              <Link className="secondary-button full" to="/reports/assets">
                Open Biggest Assets
              </Link>
            </article>

            <article className="detail-card inset-card nba-dashboard-link-card is-neutral-link">
              <span className="micro-label">Deep reads</span>
              <strong>Compare the room once today’s scores land</strong>
              <p>Use Board Matrix for the full room view, then compare any two boards to see exactly where the rankings split.</p>
              <Link className="secondary-button full" to="/board-matrix">
                Open Board Matrix
              </Link>
            </article>
          </aside>
        </div>
      </section>
    </div>
  );
}

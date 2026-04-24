import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { useEspnTodayGames } from "../hooks/useEspnTodayGames";
import { buildStandings } from "../lib/standings";
import { formatLean } from "../lib/insights";
import { areRoundPicksPublic, isSeriesPickPublic } from "../lib/pickVisibility";
import { getTeamPalette } from "../../../../packages/shared/src/themes/teamColorBanks.js";

function sameCalendarDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatPlace(value) {
  if (!Number.isFinite(value)) return "TBD";
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function formatPct(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.round(safe)}%`;
}

function formatDashboardMatrixName(member) {
  if (member?.isCurrentUser) return "You";
  const raw = member?.name ?? member?.displayName ?? "POOL";
  return raw.toUpperCase().replace(/\s+/g, "").slice(0, 8);
}

function normalizeAbbreviation(value) {
  if (value === "SA") return "SAS";
  if (value === "GS") return "GSW";
  if (value === "NY") return "NYK";
  if (value === "NO") return "NOP";
  return value;
}

function buildPairKey(left, right) {
  return [normalizeAbbreviation(left), normalizeAbbreviation(right)].sort().join("|");
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

function formatSeriesStatus(seriesItem, currentRoundLabel) {
  const conference = seriesItem.conference === "west" ? "West" : "East";
  const roundLabel = currentRoundLabel ?? "Round 1";
  const homeWins = Number(seriesItem.wins?.home ?? 0);
  const awayWins = Number(seriesItem.wins?.away ?? 0);
  const nextGameNumber = Math.min(homeWins + awayWins + 1, 7);
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? "HOME";
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? "AWAY";

  if (!homeWins && !awayWins) {
    return `${conference} ${roundLabel} · Game 1`;
  }

  if (homeWins === awayWins) {
    return `${conference} ${roundLabel} · Game ${nextGameNumber} · Series tied ${homeWins}-${awayWins}`;
  }

  const leader = homeWins > awayWins ? homeAbbr : awayAbbr;
  const leaderWins = Math.max(homeWins, awayWins);
  const trailingWins = Math.min(homeWins, awayWins);
  return `${conference} ${roundLabel} · Game ${nextGameNumber} · ${leader} leads series ${leaderWins}-${trailingWins}`;
}

function buildUpdatedSeriesStatus(seriesItem, currentRoundLabel, game) {
  if (game?.seriesHeadline && game?.seriesSummary) {
    return `${game.seriesHeadline.replace(" - ", " · ")} · ${game.seriesSummary}`;
  }

  if (!seriesItem || game?.status !== "completed") {
    return formatSeriesStatus(seriesItem, currentRoundLabel);
  }

  let homeWins = Number(seriesItem.wins?.home ?? 0);
  let awayWins = Number(seriesItem.wins?.away ?? 0);
  if (Number(game.homeScore) > Number(game.awayScore)) {
    homeWins += 1;
  } else if (Number(game.awayScore) > Number(game.homeScore)) {
    awayWins += 1;
  }

  const conference = seriesItem.conference === "west" ? "West" : "East";
  const roundLabel = currentRoundLabel ?? "Round 1";
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? "HOME";
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? "AWAY";

  if (homeWins === awayWins) {
    return `${conference} ${roundLabel} · Series tied ${homeWins}-${awayWins}`;
  }

  const leader = homeWins > awayWins ? homeAbbr : awayAbbr;
  const leaderWins = Math.max(homeWins, awayWins);
  const trailingWins = Math.min(homeWins, awayWins);
  return `${conference} ${roundLabel} · ${leader} leads series ${leaderWins}-${trailingWins}`;
}

function buildOnTapRows(todayGames, activeRoundSeries, currentRoundLabel, now, picksBySeriesId, allPicksByUser, memberList, canViewPoolSignals, isTodayGamesLoading) {
  const seriesByPair = Object.fromEntries(
    activeRoundSeries.map((seriesItem) => [
      buildPairKey(seriesItem.homeTeam.abbreviation, seriesItem.awayTeam.abbreviation),
      seriesItem,
    ])
  );

  const liveRows = todayGames
    .map((game) => {
      const pairKey = buildPairKey(game.homeAbbreviation, game.awayAbbreviation);
      const seriesItem = seriesByPair[pairKey] ?? null;
      if (!seriesItem) {
        return {
          id: game.id,
          seriesItem: null,
          tipAt: game.tipAt,
          matchupLabel: `${game.awayAbbreviation} at ${game.homeAbbreviation}`,
          timeLabel: game.status === "in_progress" ? "Live now" : formatGameTime({ status: game.status, schedule: { nextGame: { tipAt: game.tipAt }, lockAt: game.tipAt } }, now),
          statusLabel: game.seriesHeadline && game.seriesSummary
            ? `${game.seriesHeadline.replace(" - ", " · ")} · ${game.seriesSummary}`
            : game.status === "completed"
              ? "Final"
              : "Playoff game today",
          status: game.status,
          statusNote: game.statusNote,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          scoreLabel: `${game.awayAbbreviation} ${game.awayScore} - ${game.homeAbbreviation} ${game.homeScore}`,
          marketLabel: game.marketFavoriteLabel ?? "Matchup Predictor soon",
          modelLabel: game.currentLineLabel ?? "Line TBD",
          publicLean: null,
        };
      }

      const marketSummary = summarizeSeriesMarketSafe(allPicksByUser, memberList, seriesItem);
      const pick = picksBySeriesId[seriesItem.id] ?? null;
      const yourSide =
        !pick
          ? "No pick yet"
          : pick.winnerTeamId === seriesItem.homeTeam.id
            ? seriesItem.homeTeam.abbreviation
            : seriesItem.awayTeam.abbreviation;

      return {
        id: seriesItem.id,
        seriesItem,
        tipAt: game.tipAt,
        matchupLabel: `${game.awayAbbreviation} at ${game.homeAbbreviation}`,
        timeLabel: game.status === "in_progress" ? "Live now" : formatGameTime({ status: game.status, schedule: { nextGame: { tipAt: game.tipAt }, lockAt: game.tipAt } }, now),
        statusLabel: buildUpdatedSeriesStatus(seriesItem, currentRoundLabel, game),
        status: game.status,
        statusNote: game.statusNote,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        scoreLabel: `${game.awayAbbreviation} ${game.awayScore} - ${game.homeAbbreviation} ${game.homeScore}`,
        marketLabel: game.marketFavoriteLabel ?? formatLean(seriesItem, seriesItem.market, (team, pct) => `${team.abbreviation} ${pct}%`),
        modelLabel: game.currentLineLabel ?? formatLean(seriesItem, seriesItem.model, (team, pct) => `${team.abbreviation} ${pct}%`),
        yourSide,
        publicLean:
          canViewPoolSignals && marketSummary?.consensusWinnerTeamId
            ? `${marketSummary.consensusWinnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam.abbreviation : seriesItem.awayTeam.abbreviation} ${formatPct(
                Math.max(marketSummary.homePct ?? 0, marketSummary.awayPct ?? 0)
              )}`
            : null,
      };
    })
    .sort((left, right) => {
      const leftTip = new Date(left.tipAt ?? 0).getTime();
      const rightTip = new Date(right.tipAt ?? 0).getTime();
      return leftTip - rightTip;
    });

  if (liveRows.length) return liveRows;

  if (isTodayGamesLoading) {
    return [];
  }

  return activeRoundSeries
    .slice()
    .sort((left, right) => {
      const leftTip = new Date(left.schedule?.nextGame?.tipAt ?? left.schedule?.lockAt ?? 0).getTime();
      const rightTip = new Date(right.schedule?.nextGame?.tipAt ?? right.schedule?.lockAt ?? 0).getTime();
      return leftTip - rightTip;
    })
    .slice(0, 3)
    .map((seriesItem) => {
      const marketSummary = summarizeSeriesMarketSafe(allPicksByUser, memberList, seriesItem);
      const pick = picksBySeriesId[seriesItem.id] ?? null;
      return {
        id: seriesItem.id,
        seriesItem,
        matchupLabel: `${seriesItem.awayTeam.abbreviation} at ${seriesItem.homeTeam.abbreviation}`,
        timeLabel: formatGameTime(seriesItem, now),
        statusLabel: formatSeriesStatus(seriesItem, currentRoundLabel),
        status: seriesItem.status,
        marketLabel: formatLean(seriesItem, seriesItem.market, (team, pct) => `${team.abbreviation} ${pct}%`),
        modelLabel: formatLean(seriesItem, seriesItem.model, (team, pct) => `${team.abbreviation} ${pct}%`),
        yourSide:
          !pick
            ? "No pick yet"
            : pick.winnerTeamId === seriesItem.homeTeam.id
              ? seriesItem.homeTeam.abbreviation
              : seriesItem.awayTeam.abbreviation,
        publicLean:
          canViewPoolSignals && marketSummary?.consensusWinnerTeamId
            ? `${marketSummary.consensusWinnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam.abbreviation : seriesItem.awayTeam.abbreviation} ${formatPct(
                Math.max(marketSummary.homePct ?? 0, marketSummary.awayPct ?? 0)
              )}`
            : null,
      };
    });
}

function summarizeSeriesMarketSafe(allPicksByUser, memberList, seriesItem) {
  try {
    const homeCount = memberList.filter((member) => allPicksByUser[member.id]?.[seriesItem.id]?.winnerTeamId === seriesItem.homeTeam.id).length;
    const awayCount = memberList.filter((member) => allPicksByUser[member.id]?.[seriesItem.id]?.winnerTeamId === seriesItem.awayTeam.id).length;
    const total = homeCount + awayCount;
    return {
      homePct: total ? (homeCount / total) * 100 : 0,
      awayPct: total ? (awayCount / total) * 100 : 0,
      consensusWinnerTeamId:
        homeCount > awayCount ? seriesItem.homeTeam.id : awayCount > homeCount ? seriesItem.awayTeam.id : null,
    };
  } catch {
    return null;
  }
}

function getPickedTeam(seriesItem, pick) {
  if (!pick?.winnerTeamId) return null;
  return pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : seriesItem.awayTeam;
}

function formatPick(seriesItem, pick) {
  if (!pick?.winnerTeamId) return "No pick";
  const team = getPickedTeam(seriesItem, pick);
  return `${team.abbreviation} in ${pick.games}`;
}

export default function DashboardView() {
  const { profile } = useAuth();
  const { pool, memberList, settingsForPool } = usePool();
  const { currentRound, featuredSeries, series, seriesByRound } = usePlayoffData();
  const { games: todayGames, loading: todayGamesLoading } = useEspnTodayGames();
  const settings = settingsForPool(pool);
  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const canViewPoolSignals = areRoundPicksPublic(activeRoundSeries, currentRound.key, settings);
  const { picksBySeriesId, allPicksByUser } = useSeriesPickem(series);
  const standings = buildStandings(memberList, allPicksByUser, series, settings);
  const currentStanding = standings.find((member) => member.isCurrentUser) ?? null;
  const now = new Date();
  const currentMember = memberList.find((member) => member.isCurrentUser) ?? memberList[0] ?? null;
  const orderedMembers = currentMember
    ? [currentMember, ...memberList.filter((member) => member.id !== currentMember.id)]
    : memberList;

  const onTapRows = buildOnTapRows(
    todayGames,
    activeRoundSeries.length ? activeRoundSeries : featuredSeries,
    currentRound.label,
    now,
    picksBySeriesId,
    allPicksByUser,
    memberList,
    canViewPoolSignals,
    todayGamesLoading
  );

  const todayMatrixRows = onTapRows
    .map((row) => row.seriesItem)
    .filter(Boolean)
    .filter((seriesItem, index, items) => items.findIndex((entry) => entry.id === seriesItem.id) === index);

  const poolExposureFocus = [...activeRoundSeries]
    .map((seriesItem) => {
      const summary = summarizeSeriesMarketSafe(allPicksByUser, memberList, seriesItem);
      const consensusPct = Math.max(summary?.homePct ?? 0, summary?.awayPct ?? 0);
      const consensusTeam =
        summary?.consensusWinnerTeamId === seriesItem.homeTeam.id
          ? seriesItem.homeTeam.abbreviation
          : summary?.consensusWinnerTeamId === seriesItem.awayTeam.id
            ? seriesItem.awayTeam.abbreviation
            : "Split room";
      return {
        id: seriesItem.id,
        matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
        body: `${consensusTeam} is carrying ${formatPct(consensusPct)} of the visible room right now.`,
        detail:
          consensusPct >= 70
            ? "This is one of the clearest public concentration points on the board."
            : "The room is still spread enough here that late separation is possible.",
      };
    })
    .sort((left, right) => {
      const leftPct = Number(left.body.match(/\d+/)?.[0] ?? 0);
      const rightPct = Number(right.body.match(/\d+/)?.[0] ?? 0);
      return rightPct - leftPct;
    })
    .slice(0, 2);

  const nextUpRows = [...(activeRoundSeries.length ? activeRoundSeries : featuredSeries)]
    .sort((left, right) => {
      const leftTip = new Date(left.schedule?.nextGame?.tipAt ?? left.schedule?.lockAt ?? 0).getTime();
      const rightTip = new Date(right.schedule?.nextGame?.tipAt ?? right.schedule?.lockAt ?? 0).getTime();
      return leftTip - rightTip;
    })
    .slice(0, 2)
    .map((seriesItem) => ({
      id: seriesItem.id,
      matchup: `${seriesItem.homeTeam.city} vs ${seriesItem.awayTeam.city}`,
      detail: `${formatSeriesStatus(seriesItem, currentRound.label)} · ${formatGameTime(seriesItem, now)}`,
      body: `Market: ${formatLean(seriesItem, seriesItem.market)} · Model: ${formatLean(seriesItem, seriesItem.model)}`,
    }));

  return (
    <div className="nba-shell">
      <section className="nba-dashboard-main-layout">
        <div className="nba-dashboard-main-column">
          <article className="panel nba-v1-on-tap-card">
            <div className="panel-header">
              <div>
                <h1>What&apos;s On Tap</h1>
              </div>
              <Link className="secondary-button" to="/reports/briefing">
                Open Today&apos;s Briefing
              </Link>
            </div>

            <div className="nba-v1-on-tap-list">
              {onTapRows.map((row) => (
                <article className="nba-v1-on-tap-row" key={row.id}>
                  <div className="nba-v1-on-tap-time">
                    {row.status === "in_progress" ? (
                      <span className="nba-v1-live-chip">Live</span>
                    ) : row.status === "completed" ? (
                      <span className="nba-v1-on-tap-note">Final</span>
                    ) : (
                      <strong>{row.timeLabel}</strong>
                    )}
                  </div>

                  <div className="nba-v1-on-tap-copy">
                    <strong>{row.status === "scheduled" ? row.matchupLabel : row.scoreLabel}</strong>
                    {row.status !== "scheduled" ? (
                      <span className="nba-v1-on-tap-live-status">{row.statusNote ?? (row.status === "completed" ? "Final" : "Live")}</span>
                    ) : null}
                    <p className="nba-v1-on-tap-series">{row.statusLabel}</p>
                    {row.status === "scheduled" ? (
                      <div className="nba-v1-on-tap-intel">
                        <span>Market: {row.marketLabel}</span>
                        <span>Line: {row.modelLabel}</span>
                        {row.seriesItem ? <span>Your pick: {row.yourSide}</span> : null}
                        {row.publicLean ? <span>Room lean: {row.publicLean}</span> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="nba-v1-on-tap-action">
                    <Link className="secondary-button" to="/series">
                      Open series view
                    </Link>
                  </div>
                </article>
              ))}
              {!onTapRows.length ? (
                <article className="nba-v1-on-tap-row">
                  <div className="nba-v1-on-tap-time">
                    <strong>{todayGamesLoading ? "Loading" : "No games"}</strong>
                  </div>
                  <div className="nba-v1-on-tap-copy">
                    <strong>{todayGamesLoading ? "Fetching today’s slate" : "Nothing tips today"}</strong>
                    <p className="nba-v1-on-tap-series">
                      {todayGamesLoading
                        ? "We’re pulling the live ESPN board before filling in this desk."
                        : "Once the next playoff window opens, this card will populate automatically."}
                    </p>
                  </div>
                </article>
              ) : null}
            </div>
          </article>

          <article className="panel nba-v1-dashboard-matrix-card">
            <div className="panel-header">
              <div>
                <span className="label">Today&apos;s room read</span>
                <h2>Picks Matrix snapshot</h2>
              </div>
              <Link className="secondary-button" to="/matrix">
                Full Picks Matrix
              </Link>
            </div>

            {todayMatrixRows.length ? (
              <div className="nba-standings-table-shell nba-v1-dashboard-matrix-shell">
                <table className="nba-standings-table-expanded nba-matrix-table nba-v1-dashboard-matrix-table">
                  <thead>
                    <tr>
                      <th>Series</th>
                      {orderedMembers.map((member) => (
                        <th key={member.id} className={member.isCurrentUser ? "is-current-member" : ""} title={member.name ?? member.displayName ?? "Pool member"}>
                          {formatDashboardMatrixName(member)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {todayMatrixRows.map((seriesItem) => (
                      <tr key={seriesItem.id} className={isSeriesPickPublic(seriesItem, settings) ? "is-public-series" : "is-hidden-series"}>
                        <td>
                          <div
                            className="nba-standings-name-cell nba-matrix-series-cell has-matchup-palette"
                            style={{
                              "--matchup-primary": getTeamPalette("nba", seriesItem.homeTeam)?.primary ?? "#efe1c9",
                              "--matchup-secondary": getTeamPalette("nba", seriesItem.awayTeam)?.primary ?? "#d8c2a1",
                              "--matchup-home-accent": getTeamPalette("nba", seriesItem.homeTeam)?.secondary ?? "#f7e9cf",
                              "--matchup-away-accent": getTeamPalette("nba", seriesItem.awayTeam)?.secondary ?? "#f0dcc0",
                            }}
                          >
                            <strong>{seriesItem.homeTeam.abbreviation} vs {seriesItem.awayTeam.abbreviation}</strong>
                          </div>
                        </td>
                        {orderedMembers.map((member) => {
                          const pick = allPicksByUser[member.id]?.[seriesItem.id] ?? null;
                          const isPublic = isSeriesPickPublic(seriesItem, settings);
                          const showPick = member.isCurrentUser || isPublic;
                          const pickedTeam = showPick ? getPickedTeam(seriesItem, pick) : null;
                          const palette = pickedTeam ? getTeamPalette("nba", pickedTeam) : null;
                          return (
                            <td key={`${seriesItem.id}-${member.id}`} className={member.isCurrentUser ? "is-current-member" : ""}>
                              <div
                                className={`nba-matrix-cell ${showPick ? "is-public" : "is-hidden"} ${
                                  showPick && palette
                                    ? "has-team-palette"
                                    : showPick && pick?.winnerTeamId
                                      ? "nba-matrix-cell-no-pick"
                                      : "nba-matrix-cell-neutral"
                                } ${member.isCurrentUser && palette ? "is-self-palette" : ""}`}
                                style={palette ? {
                                  "--cell-primary": palette.primary,
                                  "--cell-primary-dark": palette.primaryDark,
                                  "--cell-secondary": palette.secondary,
                                  "--cell-text": palette.text,
                                  "--cell-border": palette.border,
                                } : undefined}
                              >
                                <strong>{showPick ? formatPick(seriesItem, pick) : "Hidden"}</strong>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="detail-card inset-card nba-matrix-empty-state">
                <p>
                  {todayGamesLoading
                    ? "Loading today’s matrix snapshot."
                    : "Once today’s playoff games are identified, the room’s picks for those matchups will show here."}
                </p>
              </div>
            )}
          </article>
        </div>

        <aside className="nba-dashboard-side-column">
          <article className="panel nba-v1-dashboard-side-card">
            <div className="panel-header">
              <div>
                <span className="label">{canViewPoolSignals ? "Pool exposure" : "Public signals"}</span>
                <h2>{canViewPoolSignals ? "Where the room is concentrated" : "What you can still trust publicly"}</h2>
              </div>
              <Link className="secondary-button" to={canViewPoolSignals ? "/reports/exposure" : "/reports/scenarios"}>
                Open report
              </Link>
            </div>

            <div className="nba-dashboard-list">
              {canViewPoolSignals ? (
                poolExposureFocus.map((row) => (
                  <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                    <div>
                      <strong>{row.matchup}</strong>
                      <p>{row.body}</p>
                      <p>{row.detail}</p>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="nba-dashboard-row nba-dashboard-row-stacked">
                    <div>
                      <strong>Room exposure is still private</strong>
                      <p>Until picks are public, the useful read comes from the market, the model, and your own bracket rather than from room-wide consensus.</p>
                    </div>
                  </div>
                  <div className="nba-dashboard-row nba-dashboard-row-stacked">
                    <div>
                      <strong>Use the reports for the sharper edge</strong>
                      <p>Scenario watch, win odds, and swing spots are still the cleanest public reads before the board opens up.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </article>

          <article className="panel nba-v1-dashboard-side-card">
            <div className="panel-header">
              <div>
                <span className="label">Next up</span>
                <h2>What to watch after today settles</h2>
              </div>
              <Link className="secondary-button" to="/reports">
                Open reports
              </Link>
            </div>

            <div className="nba-dashboard-list">
              {nextUpRows.map((row) => (
                <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                  <div>
                    <strong>{row.matchup}</strong>
                    <p>{row.detail}</p>
                    <p>{row.body}</p>
                  </div>
                </div>
              ))}
              <div className="nba-dashboard-row nba-dashboard-row-stacked">
                <div>
                  <strong>{currentStanding ? `${formatPlace(currentStanding.place)} in the pool right now` : "Your position will sharpen as picks settle"}</strong>
                  <p>
                    {currentStanding
                      ? `You are ${currentStanding.pointsBack} points back with ${currentStanding.summary.exact} exact picks currently in hand.`
                      : "As soon as more of the room locks in, this page becomes a much better day-of control center."}
                  </p>
                </div>
              </div>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}

import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { useAuth } from "../hooks/useAuth";
import { buildStandings } from "../lib/standings";
import { buildCommentaryPreview, formatLean } from "../lib/insights";
import { SCENARIO_WATCH_DATE, SCENARIO_WATCH_ITEMS } from "../data/scenarioWatch";

export default function DashboardView() {
  const { profile } = useAuth();
  const { pool, members, memberList, settingsForPool } = usePool();
  const { currentRound, featuredSeries, series, seriesByRound, roundSummaries } = usePlayoffData();
  const settings = settingsForPool(pool);
  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const { picksBySeriesId, allPicksByUser, pickedSeriesCount } = useSeriesPickem(activeRoundSeries);
  const isCommissioner = pool?.admin_id === profile?.id;
  const standings = buildStandings(memberList, allPicksByUser, series, settings);
  const currentStanding = standings.find((member) => member.isCurrentUser) ?? null;
  const standingsPreview = standings.slice(0, 5);
  const completedRoundPicks = activeRoundSeries.filter((series) => picksBySeriesId[series.id]?.winnerTeamId).length;
  const remainingRoundPicks = Math.max(activeRoundSeries.length - completedRoundPicks, 0);
  const roundLocks = settings.round_locks ?? {};
  const lockedRounds = roundSummaries.filter((round) => roundLocks[round.key]).length;
  const inviteHealth = pool?.invite_code ? "Ready to share" : "Invite code missing";
  const nextActionLabel =
    remainingRoundPicks > 0
      ? `You still have ${remainingRoundPicks} ${remainingRoundPicks === 1 ? "series" : "series"} to pick in ${currentRound.label}.`
      : `Your ${currentRound.label} board is filled in. Track live swings and room consensus.`;
  const positionLabel =
    standings.findIndex((member) => member.isCurrentUser) >= 0
      ? `Currently ${standings.find((member) => member.isCurrentUser)?.place}${standings.find((member) => member.isCurrentUser)?.place === 1 ? "st" : standings.find((member) => member.isCurrentUser)?.place === 2 ? "nd" : standings.find((member) => member.isCurrentUser)?.place === 3 ? "rd" : "th"} in the pool`
      : "Standings will sharpen as more picks come in";
  const commentaryPreview = buildCommentaryPreview({
    featuredSeries,
    activeRoundSeries,
    picksBySeriesId,
    allPicksByUser,
    memberList,
    currentRound,
    currentStanding,
    scenarioItems: SCENARIO_WATCH_ITEMS,
    scenarioDate: SCENARIO_WATCH_DATE,
  });
  const researchItems = featuredSeries.map((series) => {
    const marketFavorite = formatLean(series, series.market, (team, pct) => `${team.city} ${pct}%`);
    const modelFavorite = formatLean(series, series.model, (team, pct) => `${team.city} ${pct}%`);
    return {
      id: series.id,
      matchup: `${series.homeTeam.city} vs ${series.awayTeam.city}`,
      marketFavorite,
      modelFavorite,
    };
  });

  return (
    <div className="nba-shell">
      <section className="panel nba-hero-panel">
        <div className="nba-hero-copy">
          <span className="label">{commentaryPreview.eyebrow}</span>
          <h1>{commentaryPreview.headline}</h1>
          <p className="subtle">
            {commentaryPreview.body}
          </p>
          <div className="nba-commentary-placeholder">
            <strong>Local read</strong>
            <span>
              {commentaryPreview.support}
            </span>
          </div>
          <div className="nba-hero-actions">
            <Link className="primary-button" to={commentaryPreview.actionPath}>
              {commentaryPreview.actionLabel}
            </Link>
            <Link className="secondary-button" to="/pool-members">
              View pool members
            </Link>
          </div>
        </div>

        <div className="nba-scoreboard-card">
          <span className="micro-label">Your position</span>
          <strong>{positionLabel}</strong>
          <span className="subtle">{nextActionLabel}</span>
          <div className="nba-stat-grid">
            <div className="nba-stat-card">
              <span className="micro-label">Current round</span>
              <strong>{currentRound.label}</strong>
            </div>
            <div className="nba-stat-card">
              <span className="micro-label">Round picks made</span>
              <strong>{completedRoundPicks}/{activeRoundSeries.length || 0}</strong>
            </div>
            <div className="nba-stat-card">
              <span className="micro-label">Pool members</span>
              <strong>{members.length}</strong>
            </div>
          </div>
          <div className="nba-quick-actions">
            <Link className="primary-button" to="/series">
              {remainingRoundPicks > 0 ? "Finish this round" : "Review your picks"}
            </Link>
            <div className="detail-card inset-card">
              <span className="micro-label">Pool</span>
              <p>{pool?.name ?? "No active pool"} · {pool?.invite_code ?? "Pending code"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="nba-dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Standings</span>
              <h2>Pool snapshot</h2>
            </div>
            <Link className="secondary-button" to="/standings">
              Full standings
            </Link>
          </div>
          <div className="nba-dashboard-list">
            {standingsPreview.map((member, index) => (
              <div className="nba-dashboard-row" key={member.id}>
                <span className="nba-dashboard-rank">{member.place ?? index + 1}</span>
                <div>
                  <strong>{member.name}</strong>
                  <p>{member.summary.totalPoints} pts · {member.summary.exact} exact · {member.pointsBack} back</p>
                </div>
              </div>
            ))}
            {!standingsPreview.length ? <p className="subtle">No pool members yet.</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Research</span>
              <h2>Signals that may change picks</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {researchItems.map((item) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={item.id}>
                <div>
                  <strong>{item.matchup}</strong>
                  <p>Market lean: {item.marketFavorite}</p>
                  <p>Model lean: {item.modelFavorite}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Scenario watch</span>
              <h2>What can still move before the playoffs start?</h2>
            </div>
          </div>
          <p className="subtle">
            Sourced playoff-clinch uncertainty for {SCENARIO_WATCH_DATE}. Matchup and market implications below are local product inferences from the current bracket state.
          </p>
          <div className="nba-dashboard-list">
            {SCENARIO_WATCH_ITEMS.map((item) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.sourced}</p>
                  <p><strong>Likely impact:</strong> {item.likelyImpact}</p>
                  <p>{item.whyItMatters}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Live updates</span>
              <h2>What is swinging tonight</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {featuredSeries.map((series) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={series.id}>
                <div>
                  <strong>{series.homeTeam.city} vs {series.awayTeam.city}</strong>
                  <p>{series.nextGame}</p>
                  <p>{series.homeTeam.abbreviation} leads {series.wins.home}-{series.wins.away}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        {isCommissioner ? (
          <article className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Commissioner</span>
                <h2>Pool control snapshot</h2>
              </div>
            </div>
            <div className="nba-dashboard-list">
              <div className="nba-dashboard-row nba-dashboard-row-stacked">
                <div>
                  <strong>{members.length} members · {inviteHealth}</strong>
                  <p>{pool?.invite_code ? `Invite code ${pool.invite_code} is active and ready to share.` : "This pool still needs a usable invite code."}</p>
                </div>
              </div>
              <div className="nba-dashboard-row nba-dashboard-row-stacked">
                <div>
                  <strong>{lockedRounds} locked round{lockedRounds === 1 ? "" : "s"}</strong>
                  <p>{currentRound.label} is the current active window. Review round locks if you want picks read-only before games move.</p>
                </div>
              </div>
              <div className="nba-dashboard-row nba-dashboard-row-stacked">
                <div>
                  <strong>Quick commissioner actions</strong>
                  <div className="nba-report-actions">
                    <Link className="secondary-button" to="/pool-settings">
                      Open Settings
                    </Link>
                    <Link className="secondary-button" to="/pool-members">
                      View Members
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </div>
  );
}

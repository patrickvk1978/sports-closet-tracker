import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { buildStandings } from "../lib/standings";
import { formatLean } from "../lib/insights";
import { SCENARIO_WATCH_DATE, SCENARIO_WATCH_ITEMS } from "../data/scenarioWatch";
import { useProbabilityInputs } from "../hooks/useProbabilityInputs";

function formatPlace(value) {
  if (!Number.isFinite(value)) return "TBD";
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function buildTodayAngle(items) {
  if (!items.length) {
    return {
      headline: "The final seeding picture is still shaping your board.",
      body: "Today is less about live scores and more about how the last regular-season results reroute the playoff map before the Play-In begins.",
      support: "The important window now runs from the Sunday finale through the Play-In and into the Saturday, April 18, 2026 Round 1 lock.",
    };
  }

  const [primary, secondary] = items;
  return {
    headline: primary.title,
    body: `${primary.sourced} ${primary.likelyImpact}`,
    support: secondary
      ? `${primary.whyItMatters} Also watch: ${secondary.title.toLowerCase()}. Round 1 locks on Saturday, April 18, 2026.`
      : `${primary.whyItMatters} Round 1 locks on Saturday, April 18, 2026.`,
  };
}

export default function DashboardView() {
  const { profile } = useAuth();
  const { pool, members, memberList, settingsForPool } = usePool();
  const { currentRound, featuredSeries, series, seriesByRound, roundSummaries } = usePlayoffData();
  const settings = settingsForPool(pool);
  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const { picksBySeriesId, allPicksByUser } = useSeriesPickem(series);
  const isCommissioner = pool?.admin_id === profile?.id;

  const standings = buildStandings(memberList, allPicksByUser, series, settings);
  const currentStanding = standings.find((member) => member.isCurrentUser) ?? null;
  const standingsPreview = standings.slice(0, 5);
  const completedRoundPicks = activeRoundSeries.filter((seriesItem) => picksBySeriesId[seriesItem.id]?.winnerTeamId).length;
  const remainingRoundPicks = Math.max(activeRoundSeries.length - completedRoundPicks, 0);
  const roundLocks = settings.round_locks ?? {};
  const lockedRounds = roundSummaries.filter((round) => roundLocks[round.key]).length;
  const inviteHealth = pool?.invite_code ? "Ready to share" : "Invite code missing";
  const researchSeries = activeRoundSeries.length ? activeRoundSeries.slice(0, 3) : featuredSeries.slice(0, 3);
  const probabilityInputs = useProbabilityInputs(researchSeries);
  const probabilityBySeriesId = Object.fromEntries(probabilityInputs.map((entry) => [entry.entityId, entry]));
  const todayAngle = buildTodayAngle(SCENARIO_WATCH_ITEMS);

  const positionLabel = currentStanding
    ? `Currently ${formatPlace(currentStanding.place)} in the pool`
    : "Standings will sharpen as more picks come in";
  const nextActionLabel =
    remainingRoundPicks > 0
      ? `You still have ${remainingRoundPicks} ${remainingRoundPicks === 1 ? "series" : "series"} to pick in ${currentRound.label}.`
      : `Your ${currentRound.label} board is filled in. Track how the bracket firms up before the April 18, 2026 lock.`;

  const researchItems = researchSeries.map((seriesItem) => {
    const probability = probabilityBySeriesId[seriesItem.id];
    return {
      id: seriesItem.id,
      matchup: `${seriesItem.homeTeam.city} vs ${seriesItem.awayTeam.city}`,
      marketFavorite: formatLean(seriesItem, seriesItem.market, (team, pct) => `${team.city} ${pct}%`),
      modelFavorite: formatLean(seriesItem, seriesItem.model, (team, pct) => `${team.city} ${pct}%`),
      marketMeta: `${probability?.marketLabel ?? "Unknown source"} · ${probability?.marketFreshness ?? "No timestamp"}`,
      modelMeta: `${probability?.modelLabel ?? "Unknown source"} · ${probability?.modelFreshness ?? "No timestamp"}`,
    };
  });

  return (
    <div className="nba-shell">
      <section className="panel nba-hero-panel">
        <div className="nba-hero-copy">
          <span className="label">Sunday watch · {SCENARIO_WATCH_DATE}</span>
          <h1>{todayAngle.headline}</h1>
          <p className="subtle">{todayAngle.body}</p>
          <div className="nba-commentary-placeholder">
            <strong>Selection week read</strong>
            <span>{todayAngle.support}</span>
          </div>
          <div className="nba-hero-actions">
            <Link className="primary-button" to="/reports/scenarios">
              Open scenario report
            </Link>
            <Link className="secondary-button" to="/reports">
              Open all reports
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
              <span className="label">Scenario watch</span>
              <h2>What can still move before the Play-In sets the board?</h2>
            </div>
            <Link className="secondary-button" to="/reports/scenarios">
              Full report
            </Link>
          </div>
          <div className="nba-dashboard-list">
            {SCENARIO_WATCH_ITEMS.slice(0, 2).map((item) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.likelyImpact}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

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
            {standingsPreview.slice(0, 3).map((member, index) => (
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
              <h2>Signals to use before you lock Round 1</h2>
            </div>
            <Link className="secondary-button" to="/reports/win-odds">
              Open report
            </Link>
          </div>
          <div className="nba-dashboard-list">
            {researchItems.length ? researchItems.map((item) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={item.id}>
                <div>
                  <strong>{item.matchup}</strong>
                  <p>Market lean: {item.marketFavorite}</p>
                  <p>Model lean: {item.modelFavorite}</p>
                  <p className="micro-copy">{item.marketMeta}</p>
                </div>
              </div>
            )) : (
              <p className="subtle">
                Once the first-round slots settle, this card will track where market and model disagree most on the actual board you need to pick.
              </p>
            )}
          </div>
        </article>

        <article className="panel">
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
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>Watch who lands in the Play-In and who escapes it entirely</strong>
                <p>The first useful reset after today is figuring out which teams actually land on the board you have to pick.</p>
              </div>
            </div>
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>Then watch the first-round prices move</strong>
                <p>Once matchups are real, the market and model should become much more useful for separating safe picks from leverage picks.</p>
              </div>
            </div>
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>Your real decision window runs through April 18</strong>
                <p>That is when the Round 1 board locks, so the most important work is reading the bracket as it firms up, not reacting to empty placeholders.</p>
              </div>
            </div>
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

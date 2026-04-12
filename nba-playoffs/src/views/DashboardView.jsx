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
  const probabilityInputs = useProbabilityInputs(featuredSeries);
  const probabilityBySeriesId = Object.fromEntries(probabilityInputs.map((entry) => [entry.entityId, entry]));

  const heroScenario = SCENARIO_WATCH_ITEMS[0];
  const heroHeadline = heroScenario?.title ?? "What matters right now";
  const heroBody = heroScenario
    ? `${heroScenario.sourced} ${heroScenario.likelyImpact}`
    : "The next important shift will come from seeding clarity, play-in movement, and how that changes Round 1 paths.";
  const heroSupport = heroScenario
    ? `${heroScenario.whyItMatters} Round 1 locks on Saturday, April 18, 2026.`
    : `The key date here is ${SCENARIO_WATCH_DATE}.`;

  const positionLabel = currentStanding
    ? `Currently ${formatPlace(currentStanding.place)} in the pool`
    : "Standings will sharpen as more picks come in";
  const nextActionLabel =
    remainingRoundPicks > 0
      ? `You still have ${remainingRoundPicks} ${remainingRoundPicks === 1 ? "series" : "series"} to pick in ${currentRound.label}.`
      : `Your ${currentRound.label} board is filled in. Track how the bracket firms up before the April 18, 2026 lock.`;

  const researchItems = featuredSeries.map((seriesItem) => {
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
          <span className="label">What matters right now</span>
          <h1>{heroHeadline}</h1>
          <p className="subtle">{heroBody}</p>
          <div className="nba-commentary-placeholder">
            <strong>Local read</strong>
            <span>{heroSupport}</span>
          </div>
          <div className="nba-hero-actions">
            <Link className="primary-button" to="/series">
              Open series tracker
            </Link>
            <Link className="secondary-button" to="/reports">
              Open reports
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
                  <p className="micro-copy">{item.marketMeta}</p>
                  <p>Model lean: {item.modelFavorite}</p>
                  <p className="micro-copy">{item.modelMeta}</p>
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
            {featuredSeries.map((seriesItem) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={seriesItem.id}>
                <div>
                  <strong>{seriesItem.homeTeam.city} vs {seriesItem.awayTeam.city}</strong>
                  <p>{seriesItem.nextGame}</p>
                  <p>{seriesItem.homeTeam.abbreviation} leads {seriesItem.wins.home}-{seriesItem.wins.away}</p>
                </div>
              </div>
            ))}
            {!featuredSeries.length ? <p className="subtle">No live series yet. This panel will become more useful once the Play-In and Round 1 games begin.</p> : null}
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

import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { buildStandings } from "../lib/standings";
import { formatLean } from "../lib/insights";
import { SCENARIO_WATCH_DATE, SCENARIO_WATCH_ITEMS } from "../data/scenarioWatch";
import { useProbabilityInputs } from "../hooks/useProbabilityInputs";
import { summarizeSeriesMarket } from "../lib/seriesPickem";
import { areRoundPicksPublic } from "../lib/pickVisibility";
import { useCommentary } from "../hooks/useCommentary";

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

export default function DashboardView() {
  const { profile } = useAuth();
  const { pool, memberList, settingsForPool } = usePool();
  const { currentRound, featuredSeries, series, seriesByRound, roundSummaries } = usePlayoffData();
  const settings = settingsForPool(pool);
  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const canViewPoolSignals = areRoundPicksPublic(activeRoundSeries, currentRound.key, settings);
  const { picksBySeriesId, allPicksByUser, loading: picksLoading } = useSeriesPickem(series);
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
  const commentary = useCommentary({
    featuredSeries,
    activeRoundSeries,
    picksBySeriesId,
    allPicksByUser,
    memberList,
    currentRound,
    currentStanding,
    scenarioItems: SCENARIO_WATCH_ITEMS,
    scenarioDate: SCENARIO_WATCH_DATE,
    canViewPoolSignals,
    picksLoading,
  });
  let heroCommentary;
  let seriesSignalRows;
  let safestSeries;
  let biggestGapSeries;
  let biggestSwingSeries;
  let poolExposureFocus;
  let startHereCard;
  let positionLabel;
  let preLockModeLabel;
  let nextActionLabel;
  let priorityHeadline;
  let priorityBody;
  let researchItems;

  try {
    heroCommentary = !picksLoading ? (commentary ?? {
      eyebrow: "Play-In watch",
      headline: "The board is settling into its real decision window.",
      body: "Use this moment to finish the card, check the few series where the market and model still disagree, and avoid mistaking broad playoff noise for an actual move on your board.",
      support: "Round 1 selections lock on Saturday, April 18, 2026. The useful work here is personal: get your board in, then reopen only the spots that still deserve it.",
      actionLabel: "Open series tracker",
      actionPath: "/series",
    }) : null;
    seriesSignalRows = activeRoundSeries.map((seriesItem) => {
      const probability = probabilityBySeriesId[seriesItem.id];
      const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
      const pick = picksBySeriesId[seriesItem.id] ?? null;
      const marketGap = Math.abs((seriesItem.market.homeWinPct ?? 50) - (seriesItem.model.homeWinPct ?? 50));
      const marketFavoritePct = Math.max(seriesItem.market.homeWinPct ?? 50, seriesItem.market.awayWinPct ?? 50);
      const consensusPct = canViewPoolSignals ? Math.max(marketSummary.homePct, marketSummary.awayPct) : 0;
      const yourTeam = !pick
        ? null
        : pick.winnerTeamId === seriesItem.homeTeam.id
          ? seriesItem.homeTeam
          : seriesItem.awayTeam;
      const yourShare = !pick || !canViewPoolSignals
        ? 0
        : pick.winnerTeamId === seriesItem.homeTeam.id
          ? marketSummary.homePct
          : marketSummary.awayPct;
      const consensusTeam =
        !canViewPoolSignals
          ? null
          : marketSummary.consensusWinnerTeamId === seriesItem.homeTeam.id
            ? seriesItem.homeTeam
            : marketSummary.consensusWinnerTeamId === seriesItem.awayTeam.id
              ? seriesItem.awayTeam
              : null;

      return {
        id: seriesItem.id,
        seriesItem,
        probability,
        pick,
        marketSummary,
        matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
        marketGap,
        marketFavoritePct,
        consensusPct,
        yourTeam,
        yourShare,
        consensusTeam,
      };
    });
    safestSeries = [...seriesSignalRows].sort((a, b) => b.marketFavoritePct - a.marketFavoritePct)[0] ?? null;
    biggestGapSeries = [...seriesSignalRows].sort((a, b) => b.marketGap - a.marketGap)[0] ?? null;
    biggestSwingSeries = [...seriesSignalRows].sort((a, b) => {
      const aScore = (a.pick ? Math.abs(50 - a.yourShare) : 42) + a.marketGap;
      const bScore = (b.pick ? Math.abs(50 - b.yourShare) : 42) + b.marketGap;
      return bScore - aScore;
    })[0] ?? null;
    poolExposureFocus = [...seriesSignalRows].sort((a, b) => b.consensusPct - a.consensusPct)[0] ?? null;
    startHereCard = SCENARIO_WATCH_ITEMS.length
    ? {
        label: "Start here",
        title: "Scenario watch",
        headline: SCENARIO_WATCH_ITEMS[0]?.title ?? "Watch the Play-In path",
        body: SCENARIO_WATCH_ITEMS[0]?.likelyImpact ?? "The remaining bracket movement is the cleanest thing to check before you lock the board.",
        cta: "Open report",
        to: "/reports/scenarios",
      }
    : biggestSwingSeries
      ? {
          label: "Start here",
          title: "Swing spots",
          headline: biggestSwingSeries.pick
            ? `${biggestSwingSeries.yourTeam?.abbreviation ?? "This series"} is your clearest leverage call`
            : `${biggestSwingSeries.matchup} is still unresolved on your card`,
          body: biggestSwingSeries.pick
            ? `Only ${formatPct(biggestSwingSeries.yourShare)} of the room is with you there, so this is one of the fastest ways to separate from the field.`
            : "An unmade pick is still pure volatility for your position, which makes this the best place to settle next.",
          cta: "Open report",
          to: "/reports/swing",
        }
      : {
          label: "Start here",
          title: "Reports",
          headline: "Open the report stack that matters most right now",
          body: "The useful job here is not reading everything evenly. It is finding the two or three series that can still change your board the most.",
          cta: "Open reports",
          to: "/reports",
        };
    positionLabel = currentStanding
      ? `Currently ${formatPlace(currentStanding.place)} in the pool`
      : "Standings will sharpen as more picks come in";
    preLockModeLabel = canViewPoolSignals ? positionLabel : "Pre-lock board";
    nextActionLabel =
      remainingRoundPicks > 0
        ? `You still have ${remainingRoundPicks} ${remainingRoundPicks === 1 ? "series" : "series"} to pick in ${currentRound.label}.`
        : `Your ${currentRound.label} board is filled in. Track how the bracket firms up before the April 18, 2026 lock.`;
    priorityHeadline =
      remainingRoundPicks > 0
        ? `${remainingRoundPicks} ${remainingRoundPicks === 1 ? "series still needs your pick" : "series still need your picks"}`
        : SCENARIO_WATCH_ITEMS.length
          ? "Your card is in. The board still is not."
          : "Your board is set. The next job is reading where it can move.";
    priorityBody =
      remainingRoundPicks > 0
        ? `Before anything else, finish ${currentRound.label}. The most useful reports right now are the ones that help you settle the last open series without losing track of leverage.`
        : SCENARIO_WATCH_ITEMS.length
          ? `The highest-signal work now is following the Play-In and late market shifts that can reroute the board before the Saturday, April 18, 2026 lock.`
          : `The useful work now is less about filling blanks and more about spotting which series are protecting position versus giving you a chance to gain.`;

    researchItems = researchSeries.map((seriesItem) => {
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
  } catch (error) {
    console.error("DashboardView render failed softly", error);
    return (
      <div className="nba-shell">
        <section className="panel nba-hero-panel">
          <div className="nba-hero-copy">
            <span className="label">Dashboard</span>
            <h1>The board is available, but this page needs a refresh.</h1>
            <p className="subtle">
              We hit an unexpected dashboard state while loading your pool. Your picks and reports should still be available.
            </p>
            <div className="nba-hero-actions">
              <Link className="primary-button" to="/series">
                Open series tracker
              </Link>
              <Link className="secondary-button" to="/reports">
                Open reports
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="nba-shell">
      <section className="panel nba-hero-panel">
        <div className="nba-hero-copy">
          <span className="label">How to play</span>
          <h1>Pick the winners in the bracket.</h1>
          <p className="subtle">
            Start on the bracket page. Click a team in each current-round series, then choose how many games it takes
            them to win. That saves the pick right away.
          </p>
          <div className="nba-commentary-placeholder">
            <strong>{remainingRoundPicks > 0 ? `${remainingRoundPicks} pick${remainingRoundPicks === 1 ? "" : "s"} still open` : "Your bracket is filled in"}</strong>
            <span>
              {remainingRoundPicks > 0
                ? "Reports and the detailed series selector are optional helpers. They should never be the first step."
                : "Use reports or the detailed series view only if you want a second look at the board."}
            </span>
          </div>
          <div className="nba-hero-actions">
            <Link className="primary-button" to="/bracket">
              Go to Bracket
            </Link>
          </div>
          <div className="nba-hero-secondary-grid">
            <Link className="detail-card inset-card nba-hero-secondary-link" to="/reports">
              <span className="micro-label">Optional</span>
              <strong>View Reports</strong>
            </Link>
            <Link className="detail-card inset-card nba-hero-secondary-link" to="/series">
              <span className="micro-label">Optional</span>
              <strong>Series View</strong>
            </Link>
          </div>
        </div>

        <div className="nba-scoreboard-card">
          <span className="micro-label">Your position</span>
          <strong>{priorityHeadline}</strong>
          <span className="subtle">{priorityBody}</span>
          <div className="nba-stat-grid">
            <div className="nba-stat-card">
              <span className="micro-label">Current place</span>
              <strong>{preLockModeLabel}</strong>
            </div>
            <div className="nba-stat-card">
              <span className="micro-label">Round picks made</span>
              <strong>{completedRoundPicks}/{activeRoundSeries.length || 0}</strong>
            </div>
            <div className="nba-stat-card">
              <span className="micro-label">Next action</span>
              <strong>{remainingRoundPicks > 0 ? "Finish round" : "Track shifts"}</strong>
            </div>
          </div>
          <div className="nba-quick-actions">
            <Link className="primary-button" to="/series">
              {remainingRoundPicks > 0 ? "Finish this round" : "Review your picks"}
            </Link>
          </div>
        </div>
      </section>

      <section className="nba-dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">{startHereCard.label}</span>
              <h2>{startHereCard.title}</h2>
            </div>
            <Link className="secondary-button" to={startHereCard.to}>
              {startHereCard.cta}
            </Link>
          </div>
          <div className="nba-dashboard-list">
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>{startHereCard.headline}</strong>
                <p>{startHereCard.body}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Win odds</span>
              <h2>What is moving your probability most?</h2>
            </div>
            <Link className="secondary-button" to="/reports/win-odds">
              Open report
            </Link>
          </div>
          <div className="nba-dashboard-list">
            {(biggestGapSeries ? [biggestGapSeries, ...seriesSignalRows.filter((row) => row.id !== biggestGapSeries.id).slice(0, 1)] : seriesSignalRows.slice(0, 2)).map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={`${row.id}-win-odds`}>
                <div>
                  <strong>{row.matchup}</strong>
                  <p>
                    Market lean: {formatLean(row.seriesItem, row.seriesItem.market)} · Model lean: {formatLean(row.seriesItem, row.seriesItem.model)}
                  </p>
                  <p>
                    {row.marketGap >= 8
                      ? `This is one of the clearest market/model disagreements on the board, which makes it worth another look before lock.`
                      : row.pick
                        ? `${formatPct(row.yourShare)} of the room is with your side here, so this result matters for both protection and separation.`
                        : "You still have not picked this series, so it is still adding pure uncertainty to your outlook."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Swing spots</span>
              <h2>Which series can actually move you?</h2>
            </div>
            <Link className="secondary-button" to="/reports/swing">
              Open report
            </Link>
          </div>
          <div className="nba-dashboard-list">
            {(biggestSwingSeries ? [biggestSwingSeries, ...seriesSignalRows.filter((row) => row.id !== biggestSwingSeries.id).sort((a, b) => Math.abs(50 - b.yourShare) - Math.abs(50 - a.yourShare)).slice(0, 1)] : seriesSignalRows.slice(0, 2)).map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={`${row.id}-swing`}>
                <div>
                  <strong>{row.pick ? `${row.matchup} is still live leverage` : `${row.matchup} still needs your pick`}</strong>
                  <p>
                    {row.pick
                      ? canViewPoolSignals
                        ? `${formatPct(row.yourShare)} of the room is with ${row.yourTeam?.abbreviation ?? "your side"}, so this result can still create real separation.`
                        : "Before lock, this reads more like a leverage candidate than a scored swing: market, model, and your own card all say it is worth another look."
                      : "Until you pick a side here, this series is still one of the biggest open variables on your card."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>
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
            {standingsPreview.slice(0, 3).map((member, index) => (
              <div className="nba-dashboard-row" key={member.id}>
                <span className="nba-dashboard-rank">{member.place ?? index + 1}</span>
                <div>
                  <strong>{member.name ?? "Pool member"}</strong>
                  <p>{member.summary.totalPoints} pts · {member.summary.exact} exact · {member.pointsBack} back</p>
                </div>
              </div>
            ))}
            {!standingsPreview.length ? <p className="subtle">No pool members yet.</p> : null}
          </div>
        </article>

        {canViewPoolSignals ? (
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Pool exposure</span>
              <h2>Where is the room concentrated?</h2>
            </div>
            <Link className="secondary-button" to="/reports/exposure">
              Open report
            </Link>
          </div>
          <div className="nba-dashboard-list">
            {(poolExposureFocus ? [poolExposureFocus, ...seriesSignalRows.filter((row) => row.id !== poolExposureFocus.id).sort((a, b) => b.consensusPct - a.consensusPct).slice(0, 1)] : seriesSignalRows.slice(0, 2)).map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={`${row.id}-exposure`}>
                <div>
                  <strong>{row.matchup}</strong>
                  <p>
                    Consensus: {row.consensusTeam ? row.consensusTeam.abbreviation : "Room split"} · {formatPct(row.consensusPct)} of the room on one side
                  </p>
                  <p>
                    {row.consensusPct >= 70
                      ? "This is one of the clearest chalk spots on the board right now."
                      : "The room is not fully settled here yet, which leaves more room for different paths to matter."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>
        ) : (
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Public signals</span>
              <h2>What can you use before picks are public?</h2>
            </div>
            <Link className="secondary-button" to="/reports/scenarios">
              Open report
            </Link>
          </div>
          <div className="nba-dashboard-list">
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>Room exposure is still private</strong>
                <p>Before the round locks or games begin, this app stays on public bracket, market, and model inputs rather than showing where the room has landed.</p>
              </div>
            </div>
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>Use reports for the public edge</strong>
                <p>Scenario watch, win odds, and swing spots are the right places to focus until the board becomes public to everyone.</p>
              </div>
            </div>
          </div>
        </article>
        )}

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
            {researchItems.length ? researchItems.slice(0, 2).map((item) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={`${item.id}-research`}>
                <div>
                  <strong>{item.matchup}</strong>
                  <p>Market lean: {item.marketFavorite}</p>
                  <p>Model lean: {item.modelFavorite}</p>
                  <p className="micro-copy">{item.marketMeta}</p>
                </div>
              </div>
            )) : null}
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>Your real decision window runs through April 18</strong>
                <p>That is when the Round 1 board locks, so the best use of this page is deciding which reports deserve another look before the bracket firms up.</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      {isCommissioner ? (
        <section className="nba-dashboard-grid">
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
                  <strong>{memberList.length} members · {inviteHealth}</strong>
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
        </section>
      ) : null}
    </div>
  );
}

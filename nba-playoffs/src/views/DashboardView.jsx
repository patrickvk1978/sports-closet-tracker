import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";

export default function DashboardView() {
  const { pool, members, memberList, settingsForPool } = usePool();
  const { currentRound, featuredSeries, seriesByRound } = usePlayoffData();
  const settings = settingsForPool(pool);
  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const { picksBySeriesId, pickedSeriesCount } = useSeriesPickem(activeRoundSeries);
  const standingsPreview = memberList.slice(0, 5);
  const completedRoundPicks = activeRoundSeries.filter((series) => picksBySeriesId[series.id]?.winnerTeamId).length;
  const remainingRoundPicks = Math.max(activeRoundSeries.length - completedRoundPicks, 0);
  const nextActionLabel =
    remainingRoundPicks > 0
      ? `You still have ${remainingRoundPicks} ${remainingRoundPicks === 1 ? "series" : "series"} to pick in ${currentRound.label}.`
      : `Your ${currentRound.label} board is filled in. Track live swings and room consensus.`;
  const positionLabel =
    standingsPreview.findIndex((member) => member.isCurrentUser) >= 0
      ? `Currently ${standingsPreview.findIndex((member) => member.isCurrentUser) + 1}${standingsPreview.findIndex((member) => member.isCurrentUser) === 0 ? "st" : standingsPreview.findIndex((member) => member.isCurrentUser) === 1 ? "nd" : standingsPreview.findIndex((member) => member.isCurrentUser) === 2 ? "rd" : "th"} in the previewed standings`
      : "Standings will sharpen as more picks come in";
  const researchItems = featuredSeries.map((series) => {
    const marketFavorite =
      series.market.homeWinPct >= series.market.awayWinPct
        ? `${series.homeTeam.city} ${series.market.homeWinPct}%`
        : `${series.awayTeam.city} ${series.market.awayWinPct}%`;
    const modelFavorite =
      series.model.homeWinPct >= series.model.awayWinPct
        ? `${series.homeTeam.city} ${series.model.homeWinPct}%`
        : `${series.awayTeam.city} ${series.model.awayWinPct}%`;
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
          <span className="label">What matters right now</span>
          <h1>Personalized commentary will live here.</h1>
          <p className="subtle">
            This hero is reserved for the AI-driven layer: what matters most for this specific
            user, why it matters, and where they should go next.
          </p>
          <div className="nba-commentary-placeholder">
            <strong>Placeholder</strong>
            <span>
              Example: "Boston-Miami is your biggest leverage series tonight. You are against
              the room on winner and need Boston to close in 6 to gain ground."
            </span>
          </div>
          <div className="nba-hero-actions">
            <Link className="primary-button" to="/series">
              Open series tracker
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
          </div>
          <div className="nba-dashboard-list">
            {standingsPreview.map((member, index) => (
              <div className="nba-dashboard-row" key={member.id}>
                <span className="nba-dashboard-rank">{index + 1}</span>
                <div>
                  <strong>{member.name}</strong>
                  <p>{member.roleLabel}</p>
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
      </section>
    </div>
  );
}

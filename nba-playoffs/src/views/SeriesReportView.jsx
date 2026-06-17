import { Link, useParams } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { summarizeSeriesMarket } from "../lib/seriesPickem";

function winnerLabel(series, winnerTeamId, games) {
  if (!winnerTeamId) return "No pick";
  const team = winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  return `${team.abbreviation} in ${games}`;
}

export default function SeriesReportView() {
  const { seriesId } = useParams();
  const { memberList } = usePool();
  const { series } = usePlayoffData();
  const { picksBySeriesId, allPicksByUser } = useSeriesPickem(series);
  const seriesItem = series.find((item) => item.id === seriesId) ?? null;

  if (!seriesItem) {
    return (
      <div className="simple-shell">
        <Link className="back-link" to="/reports">← Back to Reports</Link>
        <div className="panel">
          <h2>Series report not found</h2>
        </div>
      </div>
    );
  }

  const yourPick = picksBySeriesId[seriesItem.id] ?? null;
  const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
  const pickedTeam = yourPick?.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : yourPick?.winnerTeamId === seriesItem.awayTeam.id ? seriesItem.awayTeam : null;
  const roomLean = marketSummary.consensusWinnerTeamId === seriesItem.homeTeam.id
    ? `${seriesItem.homeTeam.abbreviation} ${marketSummary.homePct}%`
    : marketSummary.consensusWinnerTeamId === seriesItem.awayTeam.id
      ? `${seriesItem.awayTeam.abbreviation} ${marketSummary.awayPct}%`
      : "Room split";

  return (
    <div className="nba-shell">
      <div className="simple-shell">
        <Link className="back-link" to="/reports">← Back to Reports</Link>
      </div>

      <section className="panel nba-reports-hero">
        <div>
          <span className="label">Series report</span>
          <h2>{seriesItem.homeTeam.city} vs {seriesItem.awayTeam.city}</h2>
          <p className="subtle">
            This series report turns one matchup into a clear read: where the room is, where you stand, and what kind of result would actually matter.
          </p>
        </div>
        <div className="nba-stat-grid">
          <div className="nba-stat-card">
            <span className="micro-label">Your pick</span>
            <strong>{winnerLabel(seriesItem, yourPick?.winnerTeamId, yourPick?.games)}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Room lean</span>
            <strong>{roomLean}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Market</span>
            <strong>{seriesItem.market.homeWinPct >= seriesItem.market.awayWinPct ? `${seriesItem.homeTeam.abbreviation} ${seriesItem.market.homeWinPct}%` : `${seriesItem.awayTeam.abbreviation} ${seriesItem.market.awayWinPct}%`}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Model</span>
            <strong>{seriesItem.model.homeWinPct >= seriesItem.model.awayWinPct ? `${seriesItem.homeTeam.abbreviation} ${seriesItem.model.homeWinPct}%` : `${seriesItem.awayTeam.abbreviation} ${seriesItem.model.awayWinPct}%`}</strong>
          </div>
        </div>
      </section>

      <section className="nba-dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">What matters</span>
              <h2>Your current read</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>
                  {pickedTeam
                    ? `${pickedTeam.abbreviation} is the side that matters for you`
                    : "You have not committed to a side yet"}
                </strong>
                <p>
                  {pickedTeam
                    ? `Your card is currently tied to ${pickedTeam.city}. ${roomLean === "Room split"
                        ? "The room has not settled either, so this is still an open leverage spot."
                        : roomLean.startsWith(pickedTeam.abbreviation)
                          ? "The room mostly agrees with you, so this is more defensive than explosive."
                          : "The room is leaning the other way, so this is a meaningful chance to separate."}`
                    : "Until you make a pick, this matchup is still unresolved risk for your standing."}
                </p>
              </div>
            </div>
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>Most common pool length</strong>
                <p>
                  {marketSummary.leadingGames
                    ? `${marketSummary.leadingGames} games is the most common pool call so far, with ${marketSummary.leadingGamesCount} entries on it.`
                    : "The room has not formed a usable series-length lean yet."}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Pool split</span>
              <h2>How the room is divided</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>{seriesItem.homeTeam.abbreviation}</strong>
                <p>{marketSummary.homePct}% of submitted picks</p>
              </div>
            </div>
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>{seriesItem.awayTeam.abbreviation}</strong>
                <p>{marketSummary.awayPct}% of submitted picks</p>
              </div>
            </div>
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>Still open</strong>
                <p>{marketSummary.noPickCount} pool members have not picked this series yet.</p>
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Live context</span>
              <h2>What to watch</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>{seriesItem.nextGame}</strong>
                <p>{seriesItem.homeTeam.abbreviation} {seriesItem.wins.home}-{seriesItem.wins.away} {seriesItem.awayTeam.abbreviation}</p>
                <p>This page can become the home for series-specific commentary, injury news, and late leverage notes.</p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

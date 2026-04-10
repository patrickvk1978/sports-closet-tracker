import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { summarizePickScores, summarizeSeriesMarket } from "../lib/seriesPickem";

function winnerLabel(series, winnerTeamId, games) {
  if (!winnerTeamId) return "No pick";
  const team = winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  return `${team.abbreviation} in ${games}`;
}

export default function OpponentReportView() {
  const { opponentId } = useParams();
  const { profile } = useAuth();
  const { memberList, settingsForPool, pool } = usePool();
  const { series, currentRound, seriesByRound } = usePlayoffData();
  const { picksBySeriesId, allPicksByUser } = useSeriesPickem(series);
  const settings = settingsForPool(pool);
  const opponent = memberList.find((member) => member.id === opponentId) ?? null;
  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const yourSummary = summarizePickScores(allPicksByUser[profile?.id] ?? {}, series, settings);
  const opponentSummary = summarizePickScores(allPicksByUser[opponentId] ?? {}, series, settings);

  if (!opponent) {
    return (
      <div className="simple-shell">
        <Link className="back-link" to="/reports">← Back to Reports</Link>
        <div className="panel">
          <h2>Opponent report not found</h2>
        </div>
      </div>
    );
  }

  const differenceRows = activeRoundSeries
    .map((seriesItem) => {
      const yourPick = picksBySeriesId[seriesItem.id] ?? null;
      const theirPick = allPicksByUser[opponent.id]?.[seriesItem.id] ?? null;
      const sameWinner = yourPick?.winnerTeamId && theirPick?.winnerTeamId && yourPick.winnerTeamId === theirPick.winnerTeamId;
      const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);

      return {
        id: seriesItem.id,
        matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
        yourPick: winnerLabel(seriesItem, yourPick?.winnerTeamId, yourPick?.games),
        theirPick: winnerLabel(seriesItem, theirPick?.winnerTeamId, theirPick?.games),
        different: !sameWinner || yourPick?.games !== theirPick?.games,
        roomLean:
          marketSummary.consensusWinnerTeamId === seriesItem.homeTeam.id
            ? `${seriesItem.homeTeam.abbreviation} ${marketSummary.homePct}%`
            : marketSummary.consensusWinnerTeamId === seriesItem.awayTeam.id
              ? `${seriesItem.awayTeam.abbreviation} ${marketSummary.awayPct}%`
              : "Room split",
      };
    })
    .filter((row) => row.different);

  return (
    <div className="nba-shell">
      <div className="simple-shell">
        <Link className="back-link" to="/reports">← Back to Reports</Link>
      </div>

      <section className="panel nba-reports-hero">
        <div>
          <span className="label">Opponent report</span>
          <h2>You vs {opponent.name}</h2>
          <p className="subtle">
            This matchup report isolates exactly where you and {opponent.name} diverge, so you can tell whether you need protection, upside, or one clean swing.
          </p>
        </div>
        <div className="nba-stat-grid">
          <div className="nba-stat-card">
            <span className="micro-label">You</span>
            <strong>{yourSummary.totalPoints} pts</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">{opponent.name}</span>
            <strong>{opponentSummary.totalPoints} pts</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Point gap</span>
            <strong>{yourSummary.totalPoints - opponentSummary.totalPoints}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Active differences</span>
            <strong>{differenceRows.length}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Separation points</span>
            <h2>Where this matchup can still flip</h2>
          </div>
        </div>
        <div className="nba-dashboard-list">
          {differenceRows.length ? differenceRows.map((row) => (
            <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
              <div>
                <strong>{row.matchup}</strong>
                <p>You: {row.yourPick} · {opponent.name}: {row.theirPick}</p>
                <p>Room lean: {row.roomLean}</p>
              </div>
            </div>
          )) : <p className="subtle">You and {opponent.name} are currently aligned on the active round.</p>}
        </div>
      </section>
    </div>
  );
}

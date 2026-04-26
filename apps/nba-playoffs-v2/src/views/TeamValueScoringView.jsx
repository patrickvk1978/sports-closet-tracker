import { Link } from "react-router-dom";
import { buildScoringTable } from "../lib/teamValueGame";

export default function TeamValueScoringView() {
  const scoringTable = buildScoringTable(16);

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Scoring</span>
            <h2>How each rank pays out</h2>
          </div>
          <div className="nba-report-actions">
            <Link className="secondary-button" to="/dashboard">
              Dashboard
            </Link>
            <Link className="secondary-button" to="/standings">
              Standings
            </Link>
          </div>
        </div>

        <div className="detail-card inset-card">
          <p>
            Rank 1 earns 16 points for every playoff win, rank 2 earns 15, and so on down to rank 16 earning 1 point per win. When a team wins a series, it also earns an advancement bonus based on that same rank value.
          </p>
        </div>

        <div className="nba-placeholder-grid">
          {scoringTable.map((round) => (
            <article className="detail-card inset-card" key={round.roundKey}>
              <span className="micro-label">{round.label}</span>
              <p>
                Rank 1: {round.perWin[0]?.points ?? 16} per win
              </p>
              <p>
                Series win bonus: +{round.roundBonusMultiplier}x rank value
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

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
            <Link className="secondary-button" to="/teams">
              Back to board
            </Link>
          </div>
        </div>

        <div className="detail-card inset-card">
          <p>
            Rank 1 is worth the most and rank 16 the least. Teams now score along the way, with each playoff win paying a little more than the one before it and the fourth win carrying the biggest jump.
          </p>
        </div>

        <div className="nba-placeholder-grid">
          {scoringTable.map((round) => (
            <article className="detail-card inset-card" key={round.roundKey}>
              <span className="micro-label">{round.label}</span>
              <p>
                {round.perWin.map((entry) => `Win ${entry.winNumber}: ${entry.points}`).join(" · ")}
              </p>
              <p>
                {round.byGames.map((entry) => `Win in ${entry.games}: ${entry.points}`).join(" · ")}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

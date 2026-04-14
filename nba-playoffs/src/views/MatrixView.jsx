import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { areRoundPicksPublic } from "../lib/pickVisibility";

function formatPick(seriesItem, pick) {
  if (!pick?.winnerTeamId) return "No pick";
  const team =
    pick.winnerTeamId === seriesItem.homeTeam.id
      ? seriesItem.homeTeam
      : seriesItem.awayTeam;
  return `${team.abbreviation} in ${pick.games}`;
}

export default function MatrixView() {
  const { pool, memberList, settingsForPool } = usePool();
  const settings = settingsForPool(pool);
  const { series, currentRound, seriesByRound } = usePlayoffData();
  const { allPicksByUser } = useSeriesPickem(series);
  const activeSeries = seriesByRound[currentRound.key] ?? [];
  const canViewMatrix = areRoundPicksPublic(activeSeries, currentRound.key, settings);
  const entriesReady = memberList.filter((member) => {
    const picks = allPicksByUser[member.id] ?? {};
    const completed = activeSeries.filter((seriesItem) => picks[seriesItem.id]?.winnerTeamId).length;
    return completed === activeSeries.length && activeSeries.length > 0;
  }).length;

  return (
    <div className="nba-shell">
      <section>
        <span className="label">Pick Matrix</span>
        <h2>See the whole room in one place</h2>
        <p className="subtle">
          {canViewMatrix
            ? `All ${currentRound.label} picks are public now, so this grid shows where the room is concentrated and where people diverge.`
            : `${currentRound.label} picks stay private until the round locks or games begin. This page opens once the board should be public to everyone.`}
        </p>
      </section>

      <section className="nba-reports-summary">
        <article className="detail-card inset-card">
          <span className="micro-label">Entries</span>
          <p>{memberList.length} in this pool</p>
        </article>
        <article className="detail-card inset-card">
          <span className="micro-label">Round status</span>
          <p>{canViewMatrix ? "Public board" : "Private until lock"}</p>
        </article>
        <article className="detail-card inset-card">
          <span className="micro-label">Boards ready</span>
          <p>{entriesReady}/{memberList.length}</p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">{canViewMatrix ? "Live room view" : "Private until lock"}</span>
            <h2>{canViewMatrix ? "Round matrix" : "Pick matrix locked"}</h2>
          </div>
          <div className="nba-report-actions">
            <Link className="secondary-button" to="/standings">
              Open standings
            </Link>
            <Link className="secondary-button" to="/series">
              Open series board
            </Link>
          </div>
        </div>

        {!canViewMatrix ? (
          <div className="detail-card inset-card">
            <p>
              This matrix is intentionally hidden before lock so nobody can reverse-engineer the room’s live card. Once the round is locked or games are underway, it becomes the fastest way to see every pick at once.
            </p>
          </div>
        ) : (
          <div className="nba-standings-table-shell">
            <table className="nba-standings-table-expanded nba-matrix-table">
              <thead>
                <tr>
                  <th>Series</th>
                  {memberList.map((member) => (
                    <th key={member.id}>{member.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSeries.map((seriesItem) => (
                  <tr key={seriesItem.id}>
                    <td>
                      <div className="nba-standings-name-cell">
                        <strong>{seriesItem.homeTeam.abbreviation} vs {seriesItem.awayTeam.abbreviation}</strong>
                        <span>{seriesItem.nextGame}</span>
                      </div>
                    </td>
                    {memberList.map((member) => {
                      const pick = allPicksByUser[member.id]?.[seriesItem.id] ?? null;
                      return (
                        <td key={`${seriesItem.id}-${member.id}`}>
                          <div className="nba-matrix-cell">
                            <strong>{formatPick(seriesItem, pick)}</strong>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

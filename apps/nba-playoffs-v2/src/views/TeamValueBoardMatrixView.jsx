import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { usePool } from "../hooks/usePool";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { buildBoardMatrixRows } from "../lib/teamValueBoardCompare";
import { getTeamValuePhase } from "../lib/teamValueReports";
import { getTeamPalette } from "../../../../packages/shared/src/themes/teamColorBanks.js";

function TeamBadge({ team }) {
  const palette = getTeamPalette("nba", team);
  return (
    <span
      className="assign-tag nba-board-matrix-team-pill"
      style={{
        "--matrix-primary": palette.primary,
        "--matrix-secondary": palette.secondary,
        "--matrix-border": palette.border,
        "--matrix-text": palette.text,
      }}
    >
      {team.abbreviation}
    </span>
  );
}

export default function TeamValueBoardMatrixView() {
  const { profile, session } = useAuth();
  const { memberList, settingsForPool, pool } = usePool();
  const { seriesByRound, teamsById } = usePlayoffData();
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const { allAssignmentsByUser } = useTeamValueBoard(playoffTeams);
  const currentUserId = session?.user?.id ?? profile?.id ?? null;
  const phase = getTeamValuePhase(settingsForPool(pool));
  const canViewRoom = phase === "post_lock" || Boolean(profile?.is_admin);
  const matrixRows = useMemo(
    () => buildBoardMatrixRows(playoffTeams, memberList, allAssignmentsByUser, currentUserId),
    [allAssignmentsByUser, currentUserId, memberList, playoffTeams]
  );

  if (!canViewRoom) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Board Matrix</span>
            <h2>Room-wide boards unlock after lock</h2>
          </div>
        </div>
        <p className="subtle">
          This page opens once the board phase is over. After lock, you’ll be able to scan every board in one grid and jump into two-board comparisons from the header row.
        </p>
      </section>
    );
  }

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Board Matrix</span>
            <h2>See every board in one space</h2>
          </div>
          <div className="nba-report-actions">
            <Link className="secondary-button" to="/dashboard">
              Dashboard
            </Link>
            <Link className="secondary-button" to="/standings">
              Standings
            </Link>
            <Link className="secondary-button" to="/board-compare">
              Open Compare
            </Link>
          </div>
        </div>

        <p className="subtle">
          Each column is one board. Click any name to open a deeper two-board comparison.
        </p>

        <div className="nba-board-matrix-shell">
          <table className="nba-board-matrix-table">
            <thead>
              <tr>
                <th className="nba-board-matrix-rank-head">Rank</th>
                {memberList.map((member) => {
                  const isCurrentUser = member.id === currentUserId;
                  return (
                    <th
                      key={member.id}
                      className={isCurrentUser ? "is-current-user" : ""}
                    >
                      <div className="nba-board-matrix-head-cell">
                        <Link
                          className="nba-board-matrix-member-link"
                          to={isCurrentUser ? "/board-compare" : `/board-compare?left=${currentUserId}&right=${member.id}`}
                        >
                          {member.displayName ?? member.name}
                        </Link>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.rank}>
                  <td className="nba-board-matrix-rank-index-cell">
                    <span className="nba-board-matrix-rank-index">{row.rank}</span>
                  </td>
                  {memberList.map((member) => {
                    const team = row.teamsByUser?.[member.id];
                    return (
                      <td key={member.id} className={member.id === currentUserId ? "is-current-user" : ""}>
                        {team ? <TeamBadge team={team} /> : <span className="assign-tag nba-board-matrix-team-pill is-empty">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

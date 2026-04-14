import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { usePool } from "../hooks/usePool";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { buildTeamValueStandingsWithOdds, getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { TEAM_VALUE_LOCK_AT, getTeamValuePhase } from "../lib/teamValueReports";

const SORT_OPTIONS = {
  place: { label: "Place", compare: (a, b) => a.place - b.place },
  name: { label: "Player", compare: (a, b) => a.name.localeCompare(b.name) },
  points: { label: "Points", compare: (a, b) => a.summary.totalPoints - b.summary.totalPoints },
  liveValue: { label: "Live Value", compare: (a, b) => a.liveValueRemaining - b.liveValueRemaining },
  bestAsset: { label: "Best Asset", compare: (a, b) => (a.bestRemainingAsset?.value ?? 0) - (b.bestRemainingAsset?.value ?? 0) },
  winProb: { label: "Win Probability", compare: (a, b) => (a.winProbability ?? 0) - (b.winProbability ?? 0) },
};

export default function TeamValueStandingsView() {
  const { memberList } = usePool();
  const { seriesByRound, teamsById, series } = usePlayoffData();
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const { allAssignmentsByUser, completionCount } = useTeamValueBoard(playoffTeams);
  const phase = getTeamValuePhase();
  const canViewOtherBoards = phase === "post_lock";
  const [sortKey, setSortKey] = useState("points");
  const [sortDirection, setSortDirection] = useState("desc");

  const standings = useMemo(
    () => buildTeamValueStandingsWithOdds(memberList, allAssignmentsByUser, series),
    [allAssignmentsByUser, memberList, series]
  );
  const preLockEntries = useMemo(
    () =>
      memberList
        .map((member) => {
          const assignmentCount = Object.keys(allAssignmentsByUser?.[member.id] ?? {}).length;
          return {
            ...member,
            assignmentCount,
            isComplete: assignmentCount === 16,
          };
        })
        .sort((a, b) => {
          if (a.isCurrentUser && !b.isCurrentUser) return -1;
          if (!a.isCurrentUser && b.isCurrentUser) return 1;
          if (b.assignmentCount !== a.assignmentCount) return b.assignmentCount - a.assignmentCount;
          return a.name.localeCompare(b.name);
        }),
    [allAssignmentsByUser, memberList]
  );

  const currentStanding = standings.find((member) => member.isCurrentUser) ?? null;
  const sortedStandings = useMemo(() => {
    const comparator = SORT_OPTIONS[sortKey]?.compare ?? SORT_OPTIONS.points.compare;
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...standings].sort((a, b) => {
      const result = comparator(a, b);
      if (result !== 0) return result * direction;
      return a.place - b.place;
    });
  }, [sortDirection, sortKey, standings]);

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "name" || nextKey === "place" ? "asc" : "desc");
  }

  function sortLabel(key) {
    if (sortKey !== key) return SORT_OPTIONS[key].label;
    return `${SORT_OPTIONS[key].label} ${sortDirection === "asc" ? "↑" : "↓"}`;
  }

  return (
    <div className="nba-shell">
      <section className="panel nba-hero-panel">
        <div className="nba-hero-copy">
          <span className="label">Standings</span>
          <h1>{phase === "pre_lock" ? "See who is ready for the board to lock." : "See who is ahead, and whose board can hold up."}</h1>
          <p className="subtle">
            {phase === "pre_lock"
              ? `Before lock, this page is the roster and submission board. Once lineups lock on ${new Date(TEAM_VALUE_LOCK_AT).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}, it turns into the full standings and win-probability view.`
              : currentStanding
              ? `You are ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"} with ${currentStanding.summary.totalPoints} points, ${currentStanding.liveValueRemaining} live value left, and ${currentStanding.winProbability}% win probability.`
              : "This board tracks current points, live value, and the strongest remaining assets under the team-value format."}
          </p>
        </div>
      </section>

      {phase === "pre_lock" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Entries</span>
              <h2>Pool roster before lock</h2>
            </div>
            <div className="nba-report-actions">
              <Link className="secondary-button" to="/dashboard">
                Open dashboard
              </Link>
              <Link className="secondary-button" to="/teams">
                Open my board
              </Link>
              <Link className="secondary-button" to="/reports">
                Open reports
              </Link>
            </div>
          </div>

          <div className="leaderboard-table">
            <div className="leaderboard-head prelock-entries-head">
              <span>Entry</span>
              <span>Role</span>
              <span>Board</span>
              <span>Status</span>
            </div>
            {preLockEntries.map((member) => (
              <div className="leaderboard-row prelock-entry-row" key={member.id}>
                <div className="leaderboard-player">
                  {member.isCurrentUser ? (
                    <a className="standings-board-link" href="/teams">
                      <strong>{member.name}</strong>
                    </a>
                  ) : (
                    <span className="tooltip-wrap standings-tooltip-wrap">
                      <strong className="standings-board-link disabled-link">{member.name}</strong>
                      <span className="tooltip-bubble">Other boards unlock after {new Date(TEAM_VALUE_LOCK_AT).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                  )}
                </div>
                <span className="subtle">{member.roleLabel}</span>
                <span>{member.assignmentCount}/16</span>
                <span className={member.isComplete ? "chip active" : "chip"}>
                  {member.isComplete ? "Ready for lock" : "Still building"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Leaderboard</span>
              <h2>Live standings after lock</h2>
            </div>
            <div className="nba-report-actions">
              <Link className="secondary-button" to="/dashboard">
                Open dashboard
              </Link>
              <Link className="secondary-button" to="/teams">
                Open my board
              </Link>
              <Link className="secondary-button" to="/reports">
                Open reports
              </Link>
            </div>
          </div>

          <div className="nba-standings-table-shell">
            <table className="nba-standings-table-expanded">
              <thead>
                <tr>
                  {Object.keys(SORT_OPTIONS).map((key) => (
                    <th key={key}>
                      <button className="nba-sort-button" type="button" onClick={() => handleSort(key)}>
                        {sortLabel(key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStandings.map((member) => (
                  <tr key={member.id} className={member.isCurrentUser ? "is-current-user" : ""}>
                    <td>{member.place}</td>
                    <td>
                      <div className="nba-standings-name-cell">
                        {member.isCurrentUser ? (
                          <a className="standings-board-link" href="/teams">
                            <strong>{member.name}</strong>
                          </a>
                        ) : canViewOtherBoards ? (
                          <a className="standings-board-link" href={`/teams?viewer=${member.id}`}>
                            <strong>{member.name}</strong>
                          </a>
                        ) : (
                          <span className="tooltip-wrap standings-tooltip-wrap">
                            <strong className="standings-board-link disabled-link">{member.name}</strong>
                            <span className="tooltip-bubble">Boards unlock for everyone after {new Date(TEAM_VALUE_LOCK_AT).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                          </span>
                        )}
                        <span>{member.roleLabel}</span>
                      </div>
                    </td>
                    <td>{member.summary.totalPoints}</td>
                    <td>{member.liveValueRemaining}</td>
                    <td>{member.bestRemainingAsset ? `${member.bestRemainingAsset.value} pts` : "Out"}</td>
                    <td>{member.winProbability}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

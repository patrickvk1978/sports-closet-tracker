import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { usePool } from "../hooks/usePool";
import { usePoolOdds } from "../hooks/usePoolOdds";
import { areRoundPicksPublic } from "../lib/pickVisibility";

function ordinal(value) {
  if (!Number.isFinite(value)) return "";
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

const SORT_OPTIONS = {
  place: {
    label: "Place",
    compare: (a, b) => a.place - b.place,
  },
  name: {
    label: "Player",
    compare: (a, b) => (a.name ?? "").localeCompare(b.name ?? ""),
  },
  points: {
    label: "Points",
    compare: (a, b) => a.summary.totalPoints - b.summary.totalPoints,
  },
  exact: {
    label: "Exact",
    compare: (a, b) => a.summary.exact - b.summary.exact,
  },
  odds: {
    label: "Round Win Odds",
    compare: (a, b) => (a.roundWinOdds ?? 0) - (b.roundWinOdds ?? 0),
  },
  back: {
    label: "Points Back",
    compare: (a, b) => a.pointsBack - b.pointsBack,
  },
};

export default function StandingsView() {
  const { memberList, pool, settingsForPool } = usePool();
  const { currentRound, seriesByRound } = usePlayoffData();
  const settings = settingsForPool(pool);
  const activeSeries = seriesByRound[currentRound.key] ?? [];
  const canViewOtherBoards = areRoundPicksPublic(activeSeries, currentRound.key, settings);
  const [sortKey, setSortKey] = useState("points");
  const [sortDirection, setSortDirection] = useState("desc");
  const { standings: standingsWithOdds, currentStanding, leader } = usePoolOdds(currentRound.key);
  const totalExact = standingsWithOdds.reduce((sum, member) => sum + member.summary.exact, 0);

  const sortedStandings = useMemo(() => {
    const comparator = SORT_OPTIONS[sortKey]?.compare ?? SORT_OPTIONS.points.compare;
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...standingsWithOdds].sort((a, b) => {
      const result = comparator(a, b);
      if (result !== 0) return result * direction;
      return a.place - b.place;
    });
  }, [sortDirection, sortKey, standingsWithOdds]);

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "name" || nextKey === "back" || nextKey === "place" ? "asc" : "desc");
  }

  function sortLabel(key) {
    if (sortKey !== key) return SORT_OPTIONS[key].label;
    return `${SORT_OPTIONS[key].label} ${sortDirection === "asc" ? "↑" : "↓"}`;
  }

  return (
    <div className="nba-shell">
      <section>
        <span className="label">Standings</span>
        <h2>Where the pool stands right now</h2>
        <p className="subtle">
          {currentStanding
            ? `You are ${ordinal(currentStanding.place)} in the pool, ${currentStanding.pointsBack} point${currentStanding.pointsBack === 1 ? "" : "s"} back, with ${currentStanding.roundWinOdds}% current-round win odds. ${leader?.name ? `${leader.name} leads the board right now.` : ""}`
            : `Current round: ${currentRound.label} · Pool size: ${memberList.length} · Exact calls logged: ${totalExact}`}
        </p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Leaderboard</span>
            <h2>Sortable standings table</h2>
          </div>
          <div className="nba-report-actions">
            <Link className="secondary-button" to="/reports">
              Open Reports
            </Link>
            <Link className="secondary-button" to="/matrix">
              Open Matrix
            </Link>
            <Link className="secondary-button" to="/series">
              Review Series Picks
            </Link>
          </div>
        </div>

        {sortedStandings.length ? (
          <div className="nba-standings-table-shell">
            <table className="nba-standings-table-expanded">
              <thead>
                <tr>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("place")}>
                      {sortLabel("place")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("name")}>
                      {sortLabel("name")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("points")}>
                      {sortLabel("points")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("exact")}>
                      {sortLabel("exact")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("odds")}>
                      {sortLabel("odds")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("back")}>
                      {sortLabel("back")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedStandings.map((member) => (
                  <tr key={member.id} className={member.isCurrentUser ? "is-current-user" : ""}>
                    <td>{member.place}</td>
                    <td>
                      <div className="nba-standings-name-cell">
                        {member.isCurrentUser ? (
                          <Link className="standings-board-link" to="/bracket">
                            <strong>{member.name}</strong>
                          </Link>
                        ) : canViewOtherBoards ? (
                          <Link className="standings-board-link" to={`/bracket?viewer=${member.id}`}>
                            <strong>{member.name}</strong>
                          </Link>
                        ) : (
                          <span className="tooltip-wrap standings-tooltip-wrap">
                            <strong className="standings-board-link disabled-link">{member.name}</strong>
                            <span className="tooltip-bubble">
                              Other brackets unlock after the round locks or games begin.
                            </span>
                          </span>
                        )}
                        <span>{member.isCurrentUser ? "You" : "Pool entry"}</span>
                      </div>
                    </td>
                    <td>{member.summary.totalPoints}</td>
                    <td>{member.summary.exact}</td>
                    <td>{member.roundWinOdds}%</td>
                    <td>{member.pointsBack}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="subtle">No standings yet. Once your pool has members and picks, the board will appear here.</p>
        )}
      </section>
    </div>
  );
}

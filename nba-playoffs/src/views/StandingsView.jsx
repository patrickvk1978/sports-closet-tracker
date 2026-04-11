import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { buildCurrentRoundWinOdds, buildStandings } from "../lib/standings";

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
    compare: (a, b) => a.name.localeCompare(b.name),
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
  const { profile } = useAuth();
  const { pool, memberList, settingsForPool } = usePool();
  const { series, currentRound, seriesByRound } = usePlayoffData();
  const settings = settingsForPool(pool);
  const { allPicksByUser } = useSeriesPickem(series);
  const [sortKey, setSortKey] = useState("points");
  const [sortDirection, setSortDirection] = useState("desc");

  const standings = buildStandings(memberList, allPicksByUser, series, settings);
  const currentRoundSeries = seriesByRound[currentRound.key] ?? [];
  const currentRoundWinOdds = useMemo(
    () => buildCurrentRoundWinOdds(memberList, allPicksByUser, currentRoundSeries, series, settings),
    [allPicksByUser, currentRoundSeries, memberList, series, settings]
  );
  const standingsWithOdds = useMemo(
    () => standings.map((member) => ({ ...member, roundWinOdds: currentRoundWinOdds[member.id] ?? 0 })),
    [currentRoundWinOdds, standings]
  );
  const currentStanding = standingsWithOdds.find((member) => member.id === profile?.id) ?? null;
  const leader = standingsWithOdds[0] ?? null;
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
      <section className="panel nba-reports-hero">
        <div>
          <span className="label">Standings</span>
          <h2>Where the pool stands right now</h2>
          <p className="subtle">
            This board is driven by the current Series Pick&apos;em scoring model, so you can sort the pool by
            total points, exact hits, current-round win odds, or distance from the lead.
          </p>
        </div>
        <div className="nba-stat-grid">
          <div className="nba-stat-card">
            <span className="micro-label">Current round</span>
            <strong>{currentRound.label}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Pool size</span>
            <strong>{memberList.length}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Leader</span>
            <strong>{leader?.name ?? "TBD"}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Your place</span>
            <strong>{currentStanding ? ordinal(currentStanding.place) : "TBD"}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Points Back</span>
            <strong>{currentStanding?.pointsBack ?? 0}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Round Win Odds</span>
            <strong>{currentStanding ? `${currentStanding.roundWinOdds}%` : "0%"}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Exact calls</span>
            <strong>{totalExact}</strong>
          </div>
        </div>
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
                        <strong>{member.name}</strong>
                        <span>{member.roleLabel}</span>
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

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { usePool } from "../hooks/usePool";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { buildTeamValueStandingsWithMonteCarlo, getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { getTeamValueLockAt, getTeamValuePhase } from "../lib/teamValueReports";

const SORT_OPTIONS = {
  place: { label: "Place", compare: (a, b) => a.place - b.place },
  name: { label: "Player", compare: (a, b) => a.name.localeCompare(b.name) },
  points: { label: "Points", compare: (a, b) => a.summary.totalPoints - b.summary.totalPoints },
  pointsBack: { label: "Pts Back", compare: (a, b) => a.pointsBack - b.pointsBack },
  winProb: { label: "Win Probability", compare: (a, b) => (a.winProbability ?? 0) - (b.winProbability ?? 0) },
  topTeam: { label: "Top Team", compare: (a, b) => (a.bestRemainingAsset?.value ?? 0) - (b.bestRemainingAsset?.value ?? 0) },
};

function averageAssignment(allAssignmentsByUser, teamId) {
  const values = Object.values(allAssignmentsByUser ?? {})
    .map((assignments) => Number(assignments?.[teamId] ?? 0))
    .filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSigned(value) {
  const numericValue = Number(value ?? 0);
  return `${numericValue > 0 ? "+" : ""}${numericValue.toFixed(1)}`;
}

function ordinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "in the room";
  const suffix = number % 100 >= 11 && number % 100 <= 13
    ? "th"
    : number % 10 === 1
      ? "st"
      : number % 10 === 2
        ? "nd"
        : number % 10 === 3
          ? "rd"
          : "th";
  return `${number}${suffix}`;
}

function buildBaselineAuditRows(standings, allAssignmentsByUser, playoffTeams) {
  const teamById = Object.fromEntries((playoffTeams ?? []).map((team) => [team.id, team]));
  const baselineRankById = Object.fromEntries(
    [...standings]
      .sort((a, b) => (b.baselineWinProbability ?? 0) - (a.baselineWinProbability ?? 0))
      .map((member, index) => [member.id, index + 1])
  );

  return standings
    .map((member) => {
      const assignments = allAssignmentsByUser?.[member.id] ?? {};
      const assignedTeams = Object.entries(assignments)
        .map(([teamId, value]) => {
          const team = teamById[teamId];
          const assignedValue = Number(value ?? 0);
          const roomAverage = averageAssignment(allAssignmentsByUser, teamId);
          return {
            teamId,
            abbreviation: team?.abbreviation ?? teamId.toUpperCase(),
            assignedValue,
            titlePct: Number(team?.titlePct ?? 0),
            marketLean: Number(team?.marketLean ?? 50),
            roomGap: assignedValue - roomAverage,
          };
        })
        .filter((team) => team.assignedValue > 0);

      const titleCore = assignedTeams
        .reduce((sum, team) => sum + team.assignedValue * Math.max(team.titlePct, 0), 0);
      const roomTitleCoreValues = standings.map((entry) =>
        Object.entries(allAssignmentsByUser?.[entry.id] ?? {}).reduce((sum, [teamId, value]) => {
          const team = teamById[teamId];
          return sum + Number(value ?? 0) * Math.max(Number(team?.titlePct ?? 0), 0);
        }, 0)
      );
      const roomTitleCoreAverage = roomTitleCoreValues.length
        ? roomTitleCoreValues.reduce((sum, value) => sum + value, 0) / roomTitleCoreValues.length
        : titleCore;

      const topTitleAsset = [...assignedTeams].sort(
        (a, b) => b.assignedValue * b.titlePct - a.assignedValue * a.titlePct
      )[0];
      const bestLeverage = [...assignedTeams].sort((a, b) => b.roomGap - a.roomGap)[0];
      const topSlots = [...assignedTeams]
        .sort((a, b) => b.assignedValue - a.assignedValue)
        .slice(0, 3)
        .map((team) => team.abbreviation)
        .join(", ");
      const titleCoreDelta = titleCore - roomTitleCoreAverage;
      const reason = (() => {
        if (titleCoreDelta >= 45) {
          return {
            label: "Favorite-heavy board",
            body: "The model liked how much title equity you had in high-value slots compared with the room.",
          };
        }
        if (titleCoreDelta <= -45) {
          return {
            label: "Lower title-equity start",
            body: "The model saw less favorite-driven title equity in your top slots than the average board had.",
          };
        }
        if (bestLeverage?.roomGap >= 3) {
          return {
            label: `${bestLeverage.abbreviation} leverage`,
            body: `Your clearest difference from the room was ${bestLeverage.abbreviation}, where you were ${formatSigned(bestLeverage.roomGap)} slots heavier than the field average.`,
          };
        }
        return {
          label: "Room-balanced board",
          body: "The model saw your top-end title equity and leverage profile as close to the room average.",
        };
      })();

      return {
        ...member,
        baselineRank: baselineRankById[member.id] ?? null,
        titleCoreDelta,
        topTitleAsset,
        bestLeverage,
        topSlots,
        reason: reason.label,
        reasonBody: reason.body,
      };
    })
    .sort((a, b) => (b.baselineWinProbability ?? 0) - (a.baselineWinProbability ?? 0));
}

export default function TeamValueStandingsView() {
  const { memberList, pool, settingsForPool } = usePool();
  const { seriesByRound, teamsById, series } = usePlayoffData();
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const { allAssignmentsByUser, syncedBoardCount, syncedUserIds } = useTeamValueBoard(playoffTeams);
  const settings = settingsForPool(pool);
  const phase = getTeamValuePhase(settings);
  const canViewOtherBoards = phase === "post_lock";
  const [sortKey, setSortKey] = useState("points");
  const [sortDirection, setSortDirection] = useState("desc");

  const syncedUserIdSet = useMemo(() => new Set(syncedUserIds), [syncedUserIds]);
  const trustedMembers = useMemo(
    () => memberList.filter((member) => syncedUserIdSet.has(member.id)),
    [memberList, syncedUserIdSet]
  );
  const standings = useMemo(
    () => buildTeamValueStandingsWithMonteCarlo(trustedMembers, allAssignmentsByUser, series, playoffTeams),
    [allAssignmentsByUser, trustedMembers, series, playoffTeams]
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

  const readyCount = preLockEntries.filter((member) => member.isComplete).length;
  const lockAtDisplay = new Date(getTeamValueLockAt(settings)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const lockCountdown = Math.max(
    0,
    Math.round((new Date(getTeamValueLockAt(settings)).getTime() - Date.now()) / (1000 * 60 * 60))
  );
  const preLockRows = useMemo(
    () =>
      preLockEntries.map((member) => {
        return {
          ...member,
          roomRead: member.isComplete ? "Board is locked in" : "Still building the board",
        };
      }),
    [preLockEntries]
  );
  const sortedStandings = useMemo(() => {
    const comparator = SORT_OPTIONS[sortKey]?.compare ?? SORT_OPTIONS.points.compare;
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...standings].sort((a, b) => {
      const result = comparator(a, b);
      if (result !== 0) return result * direction;
      return a.place - b.place;
    });
  }, [sortDirection, sortKey, standings]);
  const baselineAuditRows = useMemo(
    () => buildBaselineAuditRows(standings, allAssignmentsByUser, playoffTeams),
    [allAssignmentsByUser, playoffTeams, standings]
  );
  const currentUserAudit = baselineAuditRows.find((member) => member.isCurrentUser) ?? null;
  const hasSyncedBoards = syncedBoardCount >= 2;

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
      <Link className="back-link" to="/dashboard">← Back to Dashboard</Link>
      {phase === "pre_lock" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Pool pulse</span>
              <h2>What the room looks like before lock</h2>
            </div>
            <div className="nba-report-actions">
              <Link className="secondary-button" to="/dashboard">
                Dashboard
              </Link>
              <Link className="secondary-button" to="/teams">
                My Board
              </Link>
              <Link className="secondary-button" to="/board-matrix">
                Picks Matrix
              </Link>
            </div>
          </div>

          <div className="nba-team-board-status">
            <div className="detail-card inset-card">
              <span className="micro-label">Lock watch</span>
              <p>{readyCount}/{preLockEntries.length} boards are fully ranked and ready for lock.</p>
            </div>
            <div className="detail-card inset-card">
              <span className="micro-label">Countdown</span>
              <p>{lockCountdown > 0 ? `${lockCountdown} hours until lock.` : "Lock window is here."}</p>
            </div>
          </div>

          <div className="leaderboard-table">
            <div className="leaderboard-head prelock-entries-head">
              <span>Entry</span>
              <span>Board</span>
              <span>Status</span>
            </div>
            {preLockRows.map((member) => (
              <div className="leaderboard-row prelock-entry-row" key={member.id}>
                <div className="leaderboard-player">
                  {member.isCurrentUser ? (
                    <div className="prelock-entry-main">
                      <a className="standings-board-link" href="/teams">
                        <strong>{member.displayName ?? member.name}</strong>
                      </a>
                      <span>{member.roomRead}</span>
                    </div>
                  ) : (
                    <span className="tooltip-wrap standings-tooltip-wrap">
                      <span className="prelock-entry-main">
                        <strong className="standings-board-link disabled-link">{member.displayName ?? member.name}</strong>
                        <span>{member.roomRead}</span>
                      </span>
                      <span className="tooltip-bubble">Other boards unlock after {lockAtDisplay}</span>
                    </span>
                  )}
                </div>
                <span>{member.assignmentCount}/16</span>
                <div className="prelock-entry-status">
                  <span className={member.isComplete ? "chip active" : "chip"}>
                    {member.isComplete ? "Ready for lock" : "Still building"}
                  </span>
                </div>
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
              <Link className="secondary-button" to="/board-matrix">
                Picks Matrix
              </Link>
              <Link className="secondary-button" to="/reports/board-implications">
                Today's Briefing
              </Link>
            </div>
          </div>

          {hasSyncedBoards ? (
            <>
              {currentUserAudit ? (
                <div className="nba-baseline-audit-card">
                  <div>
                    <span className="micro-label">Model check</span>
                    <h3>
                      You started at {currentUserAudit.baselineWinProbability}% and are now at{" "}
                      {currentUserAudit.winProbability}%.
                    </h3>
                    <p>
                      The model had you {currentUserAudit.baselineRank ? ordinal(currentUserAudit.baselineRank) : "in the room"} at lock.
                      Your top slots were {currentUserAudit.topSlots || "N/A"}. {currentUserAudit.reasonBody}
                    </p>
                  </div>
                  <div className="nba-baseline-audit-metrics">
                    <div>
                      <span>Title core vs room</span>
                      <strong>{formatSigned(currentUserAudit.titleCoreDelta)}</strong>
                    </div>
                    <div>
                      <span>Best leverage</span>
                      <strong>
                        {currentUserAudit.bestLeverage
                          ? `${currentUserAudit.bestLeverage.abbreviation} ${formatSigned(currentUserAudit.bestLeverage.roomGap)}`
                          : "N/A"}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="nba-baseline-audit-table-shell">
                <div className="nba-baseline-audit-table-head">
                  <span>Start</span>
                  <span>Player</span>
                  <span>Start Win%</span>
                  <span>Now</span>
                  <span>Model read</span>
                </div>
                {baselineAuditRows.map((member) => (
                  <div className={member.isCurrentUser ? "nba-baseline-audit-row is-current-user" : "nba-baseline-audit-row"} key={member.id}>
                    <span>{member.baselineRank}</span>
                    <strong>{member.isCurrentUser ? "You" : member.displayName ?? member.name}</strong>
                    <span>{member.baselineWinProbability}%</span>
                    <span>
                      {member.winProbability}% ({member.winProbabilityDelta > 0 ? "+" : ""}
                      {member.winProbabilityDelta} pts)
                    </span>
                    <span>{member.reason}</span>
                  </div>
                ))}
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
                                <strong>{member.displayName ?? member.name}</strong>
                              </a>
                            ) : canViewOtherBoards ? (
                              <a className="standings-board-link" href={`/teams?viewer=${member.id}`}>
                                <strong>{member.displayName ?? member.name}</strong>
                              </a>
                            ) : (
                              <span className="tooltip-wrap standings-tooltip-wrap">
                                <strong className="standings-board-link disabled-link">{member.displayName ?? member.name}</strong>
                                <span className="tooltip-bubble">Boards unlock for everyone after {lockAtDisplay}</span>
                              </span>
                            )}
                            <span>{member.isCurrentUser ? "You" : "Pool entry"}</span>
                          </div>
                        </td>
                        <td>{member.summary.totalPoints}</td>
                        <td>{member.pointsBack}</td>
                        <td>
                          <div className="nba-standings-winprob-cell">
                            <strong>{member.winProbability}%</strong>
                            <span>
                              Start {member.baselineWinProbability ?? 0}% ·
                              {" "}
                              {member.winProbabilityDelta > 0 ? "+" : ""}
                              {member.winProbabilityDelta ?? 0} pts
                            </span>
                          </div>
                        </td>
                        <td>
                          {member.bestRemainingAsset
                            ? `${playoffTeams.find((team) => team.id === member.bestRemainingAsset.teamId)?.abbreviation ?? member.bestRemainingAsset.teamId?.toUpperCase?.() ?? "Team"} (${member.bestRemainingAsset.value})`
                            : "Out"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="detail-card inset-card">
                <span className="micro-label">How points are showing up already</span>
                <p>Teams score their board value for every playoff win, then add a rank-scaled bonus when they win a series. That means every game can move the standings, and later rounds still carry bigger advancement swings.</p>
              </div>
            </>
          ) : (
            <div className="detail-card inset-card">
              <span className="micro-label">Board sync required</span>
              <p>Only {syncedBoardCount} live board{syncedBoardCount === 1 ? "" : "s"} are synced to the server for this pool right now, so the standings cannot be trusted yet. Open <strong>My Board</strong> first to resync your saved board, then come back here.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

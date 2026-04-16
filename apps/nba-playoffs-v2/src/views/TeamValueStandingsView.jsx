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
  const readyCount = preLockEntries.filter((member) => member.isComplete).length;
  const lockCountdown = Math.max(
    0,
    Math.round((new Date(TEAM_VALUE_LOCK_AT).getTime() - Date.now()) / (1000 * 60 * 60))
  );
  const consensusLeader = useMemo(() => {
    const topCounts = Object.values(allAssignmentsByUser ?? {}).reduce((counts, assignmentMap) => {
      const topTeamId = Object.entries(assignmentMap ?? {}).find(([, value]) => Number(value) === 16)?.[0];
      if (!topTeamId) return counts;
      counts[topTeamId] = (counts[topTeamId] ?? 0) + 1;
      return counts;
    }, {});

    const bestEntry = Object.entries(topCounts).sort((a, b) => b[1] - a[1])[0];
    if (!bestEntry) return null;
    const team = playoffTeams.find((entry) => entry.id === bestEntry[0]);
    return team ? { label: `${team.city} ${team.name}`, count: bestEntry[1] } : null;
  }, [allAssignmentsByUser, playoffTeams]);
  const topThreeAnchor = useMemo(() => {
    const topThreeCounts = Object.values(allAssignmentsByUser ?? {}).reduce((counts, assignmentMap) => {
      Object.entries(assignmentMap ?? {}).forEach(([teamId, value]) => {
        const numericValue = Number(value);
        if (numericValue >= 14) counts[teamId] = (counts[teamId] ?? 0) + 1;
      });
      return counts;
    }, {});

    const bestEntry = Object.entries(topThreeCounts).sort((a, b) => b[1] - a[1])[0];
    if (!bestEntry) return null;
    const team = playoffTeams.find((entry) => entry.id === bestEntry[0]);
    return team ? { label: `${team.city} ${team.name}`, count: bestEntry[1] } : null;
  }, [allAssignmentsByUser, playoffTeams]);
  const biggestOutlier = useMemo(() => {
    const assignmentEntries = Object.entries(allAssignmentsByUser ?? {});
    if (!assignmentEntries.length) return null;

    const averageByTeam = playoffTeams.reduce((map, team) => {
      const values = assignmentEntries
        .map(([, assignmentMap]) => Number(assignmentMap?.[team.id] ?? 0))
        .filter((value) => value > 0);
      map[team.id] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return map;
    }, {});

    let best = null;
    preLockEntries.forEach((member) => {
      const assignmentMap = allAssignmentsByUser?.[member.id] ?? {};
      playoffTeams.forEach((team) => {
        const assignedValue = Number(assignmentMap?.[team.id] ?? 0);
        if (!assignedValue) return;
        const gap = Math.abs(assignedValue - (averageByTeam[team.id] ?? assignedValue));
        if (!best || gap > best.gap) {
          best = {
            memberName: member.displayName ?? member.name,
            teamLabel: `${team.city} ${team.name}`,
            gap: Math.round(gap),
          };
        }
      });
    });

    return best;
  }, [allAssignmentsByUser, playoffTeams, preLockEntries]);
  const boldestBoard = useMemo(() => {
    const assignmentEntries = Object.entries(allAssignmentsByUser ?? {});
    if (!assignmentEntries.length) return null;

    const averageByTeam = playoffTeams.reduce((map, team) => {
      const values = assignmentEntries
        .map(([, assignmentMap]) => Number(assignmentMap?.[team.id] ?? 0))
        .filter((value) => value > 0);
      map[team.id] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return map;
    }, {});

    let best = null;
    preLockEntries.forEach((member) => {
      const assignmentMap = allAssignmentsByUser?.[member.id] ?? {};
      const assignedTeams = playoffTeams
        .map((team) => ({
          team,
          value: Number(assignmentMap?.[team.id] ?? 0),
        }))
        .filter((entry) => entry.value > 0);
      if (!assignedTeams.length) return;

      const averageGap =
        assignedTeams.reduce(
          (sum, entry) => sum + Math.abs(entry.value - (averageByTeam[entry.team.id] ?? entry.value)),
          0
        ) / assignedTeams.length;
      const topSlot = assignedTeams.find((entry) => entry.value === 16)?.team;

      if (!best || averageGap > best.gap) {
        best = {
          memberName: member.displayName ?? member.name,
          gap: averageGap,
          topSlotLabel: topSlot ? `${topSlot.city} ${topSlot.name}` : null,
        };
      }
    });

    return best
      ? {
          memberName: best.memberName,
          gap: Math.round(best.gap * 10) / 10,
          topSlotLabel: best.topSlotLabel,
        }
      : null;
  }, [allAssignmentsByUser, playoffTeams, preLockEntries]);
  const preLockRows = useMemo(
    () =>
      preLockEntries.map((member) => {
        const assignmentMap = allAssignmentsByUser?.[member.id] ?? {};
        const topSlotTeamId = Object.entries(assignmentMap).find(([, value]) => Number(value) === 16)?.[0] ?? null;
        const topSlotTeam = playoffTeams.find((team) => team.id === topSlotTeamId) ?? null;
        const topSlotMatchesConsensus =
          topSlotTeam && consensusLeader ? consensusLeader.label === `${topSlotTeam.city} ${topSlotTeam.name}` : false;

        const topThreeCount = Object.values(assignmentMap).filter((value) => Number(value) >= 14).length;

        return {
          ...member,
          topSlotLabel: topSlotTeam ? `${topSlotTeam.city} ${topSlotTeam.name}` : "No rank 1 yet",
          roomRead: !topSlotTeam
            ? "Still shaping the top of the board"
            : topSlotMatchesConsensus
              ? "Leaning with the room at the top"
              : "Setting a different tone at the top",
          topThreeCount,
        };
      }),
    [allAssignmentsByUser, consensusLeader, playoffTeams, preLockEntries]
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
              ? `Before lock, this page should tell you what the room looks like. Once lineups lock on ${new Date(TEAM_VALUE_LOCK_AT).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}, it turns into the full standings and win-probability view.`
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
              <span className="label">Pool pulse</span>
              <h2>What the room looks like before lock</h2>
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

          <div className="nba-team-board-status">
            <div className="detail-card inset-card">
              <span className="micro-label">Lock watch</span>
              <p>{readyCount}/{preLockEntries.length} boards are fully ranked and ready for lock.</p>
            </div>
            <div className="detail-card inset-card">
              <span className="micro-label">Countdown</span>
              <p>{lockCountdown > 0 ? `${lockCountdown} hours until lock.` : "Lock window is here."}</p>
            </div>
            <div className="detail-card inset-card">
              <span className="micro-label">Top consensus</span>
              <p>{consensusLeader ? `${consensusLeader.label} is sitting in rank 1 on ${consensusLeader.count}/${preLockEntries.length} boards.` : "Consensus will sharpen as more boards settle in."}</p>
            </div>
            <div className="detail-card inset-card">
              <span className="micro-label">Top-3 anchor</span>
              <p>{topThreeAnchor ? `${topThreeAnchor.label} is landing in the top three on ${topThreeAnchor.count}/${preLockEntries.length} boards.` : "The room has not settled on a top-three anchor yet."}</p>
            </div>
            <div className="detail-card inset-card">
              <span className="micro-label">Biggest outlier</span>
              <p>{biggestOutlier ? `${biggestOutlier.memberName} is furthest from the room on ${biggestOutlier.teamLabel}, about ${biggestOutlier.gap} rank${biggestOutlier.gap === 1 ? "" : "s"} from consensus.` : "The room is still settling into shape."}</p>
            </div>
            <div className="detail-card inset-card">
              <span className="micro-label">Boldest board</span>
              <p>{boldestBoard ? `${boldestBoard.memberName} is furthest from the room overall${boldestBoard.topSlotLabel ? `, starting with ${boldestBoard.topSlotLabel} at rank 1` : ""}.` : "The room is still too early to spot a true rogue board."}</p>
            </div>
          </div>

          <div className="leaderboard-table">
            <div className="leaderboard-head prelock-entries-head">
              <span>Entry</span>
              <span>Board</span>
              <span>Top of board</span>
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
                      <span className="tooltip-bubble">Other boards unlock after {new Date(TEAM_VALUE_LOCK_AT).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                  )}
                </div>
                <span>{member.assignmentCount}/16</span>
                <div className="prelock-entry-top-slot">
                  <strong>{member.topSlotLabel}</strong>
                  <span>{member.topThreeCount}/3 top slots set</span>
                </div>
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
                            <strong>{member.displayName ?? member.name}</strong>
                          </a>
                        ) : canViewOtherBoards ? (
                          <a className="standings-board-link" href={`/teams?viewer=${member.id}`}>
                            <strong>{member.displayName ?? member.name}</strong>
                          </a>
                        ) : (
                          <span className="tooltip-wrap standings-tooltip-wrap">
                            <strong className="standings-board-link disabled-link">{member.displayName ?? member.name}</strong>
                            <span className="tooltip-bubble">Boards unlock for everyone after {new Date(TEAM_VALUE_LOCK_AT).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                          </span>
                        )}
                        <span>{member.isCurrentUser ? "You" : "Pool entry"}</span>
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

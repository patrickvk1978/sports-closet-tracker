import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { usePool } from "../hooks/usePool";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { TEAM_VALUE_SLOTS, buildScoringTable } from "../lib/teamValueGame";
import { buildTeamSelectionRows, getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { TEAM_VALUE_LOCK_AT, getTeamValuePhase } from "../lib/teamValueReports";

const SORT_OPTIONS = {
  team: {
    label: "Team",
    compare: (a, b) =>
      `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`),
  },
  conference: {
    label: "Conf.",
    compare: (a, b) => a.conference.localeCompare(b.conference) || a.seed - b.seed,
  },
  seed: {
    label: "Seed",
    compare: (a, b) => a.seed - b.seed,
  },
  market: {
    label: "Round 1 market",
    compare: (a, b) => (a.marketLean ?? 0) - (b.marketLean ?? 0),
  },
  title: {
    label: "Championship",
    compare: (a, b) => (a.titleOddsPct ?? 0) - (b.titleOddsPct ?? 0),
  },
  model: {
    label: "Model",
    compare: (a, b) => (a.modelLean ?? 0) - (b.modelLean ?? 0),
  },
  expectedPoints: {
    label: "Expected points",
    compare: (a, b) => (a.expectedPoints ?? 0) - (b.expectedPoints ?? 0),
  },
  poolEv: {
    label: "Pool EV",
    compare: (a, b) => (a.poolEv ?? 0) - (b.poolEv ?? 0),
  },
  value: {
    label: "Your value",
    compare: (a, b) => (a.assignedValue ?? 0) - (b.assignedValue ?? 0),
  },
};

export default function TeamsBoardView() {
  const { profile, session } = useAuth();
  const { memberList } = usePool();
  const [searchParams, setSearchParams] = useSearchParams();
  const { seriesByRound, teamsById } = usePlayoffData();
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const { boardRows, allAssignmentsByUser, boardValidation, completionCount, saveAssignment, saveBoardOrder } = useTeamValueBoard(playoffTeams);
  const scoringTable = buildScoringTable(16);
  const [sortKey, setSortKey] = useState("poolEv");
  const [sortDirection, setSortDirection] = useState("desc");
  const [draggingTeamId, setDraggingTeamId] = useState("");
  const [boardViewMode, setBoardViewMode] = useState("table");
  const phase = getTeamValuePhase();
  const currentUserId = session?.user?.id ?? profile?.id ?? null;
  const requestedViewerId = searchParams.get("viewer") ?? "";
  const availableViewers = memberList.filter((member) => member.id !== currentUserId);
  const canViewOtherBoards = phase === "post_lock";
  const selectedViewerId =
    canViewOtherBoards && memberList.some((member) => member.id === requestedViewerId)
      ? requestedViewerId
      : currentUserId;
  const selectedViewer = memberList.find((member) => member.id === selectedViewerId) ?? memberList.find((member) => member.id === currentUserId) ?? null;
  const isViewingCurrentUser = selectedViewerId === currentUserId;

  useEffect(() => {
    if (!canViewOtherBoards && requestedViewerId) {
      setSearchParams({}, { replace: true });
    }
  }, [canViewOtherBoards, requestedViewerId, setSearchParams]);

  const selectionRows = useMemo(
    () =>
      buildTeamSelectionRows(
        boardRows,
        seriesByRound,
        allAssignmentsByUser,
        currentUserId,
        memberList.length
      ),
    [allAssignmentsByUser, boardRows, currentUserId, memberList.length, seriesByRound]
  );
  const viewedAssignments = allAssignmentsByUser?.[selectedViewerId] ?? {};
  const displayedRows = useMemo(
    () =>
      selectionRows.map((team) => ({
        ...team,
        assignedValue: Number(viewedAssignments?.[team.id] ?? 0),
      })),
    [selectionRows, viewedAssignments]
  );

  const sortedRows = useMemo(() => {
    const comparator = SORT_OPTIONS[sortKey]?.compare ?? SORT_OPTIONS.poolEv.compare;
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...displayedRows].sort((a, b) => {
      const result = comparator(a, b);
      if (result !== 0) return result * direction;
      return a.seed - b.seed || a.city.localeCompare(b.city);
    });
  }, [displayedRows, sortDirection, sortKey]);
  const rankedRows = useMemo(
    () =>
      [...displayedRows].sort(
        (a, b) =>
          (b.assignedValue ?? 0) - (a.assignedValue ?? 0) ||
          b.poolEv - a.poolEv ||
          a.seed - b.seed
      ),
    [displayedRows]
  );

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "team" || nextKey === "conference" || nextKey === "seed" ? "asc" : "desc");
  }

  function sortLabel(key) {
    if (sortKey !== key) return SORT_OPTIONS[key].label;
    return `${SORT_OPTIONS[key].label} ${sortDirection === "asc" ? "↑" : "↓"}`;
  }

  function handleViewerChange(event) {
    const nextViewerId = event.target.value;
    if (!nextViewerId || nextViewerId === currentUserId) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ viewer: nextViewerId }, { replace: true });
  }

  function moveDraggedTeam(targetTeamId) {
    if (!draggingTeamId || draggingTeamId === targetTeamId) return;
    const nextOrder = [...rankedRows];
    const fromIndex = nextOrder.findIndex((team) => team.id === draggingTeamId);
    const toIndex = nextOrder.findIndex((team) => team.id === targetTeamId);
    if (fromIndex < 0 || toIndex < 0) return;

    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    saveBoardOrder(nextOrder.map((team) => team.id));
  }

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Teams board</span>
            <h2>{isViewingCurrentUser ? "Build the board team by team." : `Read ${selectedViewer?.name ?? "this entry"}’s board team by team.`}</h2>
          </div>
          <span className="chip">
            {isViewingCurrentUser ? `${completionCount}/16 assigned` : `Viewing ${selectedViewer?.name ?? "member"}’s board`}
          </span>
        </div>

        <div className="detail-card inset-card">
          <p>
            {isViewingCurrentUser
              ? <>Your highest-conviction team gets <strong>16</strong>, your lowest gets <strong>1</strong>, and every value can be used only once. The decision is not just who is best, but who is best for each slot before lock on <strong>Saturday, April 18, 2026</strong>.</>
              : <>This is the locked 16-to-1 order for this entry. Once the board is public, the useful questions become where the top slots sit and which teams are carrying the most live value.</>}
          </p>
        </div>

        <div className="nba-team-board-status">
          <div className="detail-card inset-card">
            <span className="micro-label">Board status</span>
            <p>
              {isViewingCurrentUser && boardValidation.valid
                ? "Your board is complete and valid."
                : isViewingCurrentUser
                  ? `Still missing ${boardValidation.missingValues.length} value${boardValidation.missingValues.length === 1 ? "" : "s"} and ${boardValidation.missingTeams.length} team assignment${boardValidation.missingTeams.length === 1 ? "" : "s"}.`
                  : `${selectedViewer?.name ?? "This entry"}’s locked board is shown read-only here.`}
            </p>
          </div>
          <div className="detail-card inset-card">
            <span className="micro-label">Selection lens</span>
            <p>Round 1 market handles near-term safety. Championship odds bring in long-tail ceiling. Expected points and pool EV are the first-pass reads on how much each slot-team pairing is worth.</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">My Board</span>
            <h2>{boardViewMode === "table" ? (isViewingCurrentUser ? "Research before you assign the slots." : `Study ${selectedViewer?.name ?? "this entry"}’s board through the research lens.`) : (isViewingCurrentUser ? "Reorder the board in one move." : `Read ${selectedViewer?.name ?? "this entry"}’s locked order from 16 down to 1.`)}</h2>
          </div>
          <div className="nba-report-actions">
            {canViewOtherBoards ? (
              <select
                className="nav-select"
                value={isViewingCurrentUser ? "" : selectedViewerId}
                onChange={handleViewerChange}
                aria-label="Choose a board to view"
              >
                <option value="">Viewing: My board</option>
                {availableViewers.map((member) => (
                  <option key={member.id} value={member.id}>
                    View {member.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="tooltip-wrap tooltip-wrap-inline">
                <button type="button" className="secondary-button" disabled>
                  View another board
                </button>
                <span className="tooltip-bubble">Available after lock on {new Date(TEAM_VALUE_LOCK_AT).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </span>
            )}
            <Link className="secondary-button" to="/dashboard">
              Open dashboard
            </Link>
            <Link className="secondary-button" to="/standings">
              Open standings
            </Link>
            <Link className="secondary-button" to="/reports">
              Open reports
            </Link>
          </div>
        </div>

        <div className="tab-set">
          <button
            type="button"
            className={boardViewMode === "table" ? "tab active" : "tab"}
            onClick={() => setBoardViewMode("table")}
          >
            Research table
          </button>
          <button
            type="button"
            className={boardViewMode === "drag" ? "tab active" : "tab"}
            onClick={() => setBoardViewMode("drag")}
          >
            Drag / drop
          </button>
        </div>

        <div className="detail-card inset-card">
          <p>
            {boardViewMode === "drag"
              ? isViewingCurrentUser
                ? "Drag teams up and down to reorder the whole board. The top row becomes 16, then 15, all the way down to 1."
                : "After lock, this is the cleanest way to read another entry’s full board from top asset to bottom slot."
              : "Use the research table to compare market, model, expected points, and pool EV before you decide where each slot belongs."}
          </p>
        </div>

        {boardViewMode === "table" ? (
          <div className="nba-team-board-table-shell">
            <table className="nba-team-board-table">
              <thead>
                <tr>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("team")}>
                      {sortLabel("team")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("conference")}>
                      {sortLabel("conference")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("seed")}>
                      {sortLabel("seed")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("market")}>
                      {sortLabel("market")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("title")}>
                      {sortLabel("title")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("model")}>
                      {sortLabel("model")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("expectedPoints")}>
                      {sortLabel("expectedPoints")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("poolEv")}>
                      {sortLabel("poolEv")}
                    </button>
                  </th>
                  <th>
                    <button className="nba-sort-button" type="button" onClick={() => handleSort("value")}>
                      {sortLabel("value")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((team) => (
                  <tr key={team.id}>
                    <td>
                      <div className="nba-standings-name-cell">
                        <strong>{team.city} {team.name}</strong>
                        <span>{team.abbreviation}</span>
                      </div>
                    </td>
                    <td>{team.conference}</td>
                    <td>{team.seed}</td>
                    <td>{team.marketLean}%</td>
                    <td>{team.titleOddsDisplay} <span className="muted-inline">({team.titleOddsPct}%)</span></td>
                    <td>{team.modelLean}%</td>
                    <td>{team.expectedPoints}</td>
                    <td>{team.poolEv}</td>
                    <td>
                      <select
                        className="team-value-select"
                        value={team.assignedValue || ""}
                        onChange={(event) => saveAssignment(team.id, Number(event.target.value))}
                        aria-label={`Assign value for ${team.city} ${team.name}`}
                        disabled={!isViewingCurrentUser}
                      >
                        <option value="" disabled>Select</option>
                        {TEAM_VALUE_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="board-table">
            {rankedRows.map((team) => (
              <div
                key={team.id}
                className={`board-row ${draggingTeamId === team.id ? "selected" : ""} ${!isViewingCurrentUser ? "read-only" : ""}`}
                draggable={isViewingCurrentUser}
                onDragStart={() => setDraggingTeamId(team.id)}
                onDragEnd={() => setDraggingTeamId("")}
                onDragOver={(event) => {
                  if (!isViewingCurrentUser) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!isViewingCurrentUser) return;
                  event.preventDefault();
                  moveDraggedTeam(team.id);
                  setDraggingTeamId("");
                }}
              >
                <span className="board-rank">{team.assignedValue}</span>
                <div className="board-player">
                  <strong>{team.city} {team.name}</strong>
                  <span className="assign-tag">{team.abbreviation}</span>
                </div>
                <span>{team.marketLean}% R1</span>
                <span>{team.expectedPoints} expected pts</span>
                <span className="muted-inline">{isViewingCurrentUser ? "Drag to reorder" : "Locked board"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Scoring table</span>
            <h2>What a 16-point team is worth by round</h2>
          </div>
        </div>

        <div className="nba-placeholder-grid">
          {scoringTable.map((round) => (
            <article className="detail-card inset-card" key={round.roundKey}>
              <span className="micro-label">{round.label}</span>
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

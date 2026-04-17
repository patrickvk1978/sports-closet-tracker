import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { usePool } from "../hooks/usePool";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import {
  TEAM_VALUE_DISPLAY_RANKS,
  getDisplayRankFromValue,
  getValueFromDisplayRank,
} from "../lib/teamValueGame";
import { buildTeamSelectionRows, getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { TEAM_VALUE_LOCK_AT, getTeamValuePhase } from "../lib/teamValueReports";

const SORT_OPTIONS = {
  team: {
    label: "Team",
    compare: (a, b) =>
      `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`),
  },
  conference: {
    label: "Conf",
    compare: (a, b) => a.conference.localeCompare(b.conference) || a.seed - b.seed,
  },
  seed: {
    label: "Seed",
    compare: (a, b) => a.seed - b.seed,
  },
  market: {
    label: "Rd1",
    compare: (a, b) => (a.marketLean ?? 0) - (b.marketLean ?? 0),
  },
  title: {
    label: "Title",
    compare: (a, b) => (a.titleOddsPct ?? 0) - (b.titleOddsPct ?? 0),
  },
  model: {
    label: "Model",
    compare: (a, b) => (a.modelLean ?? 0) - (b.modelLean ?? 0),
  },
  expectedPoints: {
    label: "Exp Pts",
    compare: (a, b) => (a.expectedPoints ?? 0) - (b.expectedPoints ?? 0),
  },
  poolEv: {
    label: "Pool EV",
    compare: (a, b) => (a.poolEv ?? 0) - (b.poolEv ?? 0),
  },
  value: {
    label: "Rank",
    compare: (a, b) => (a.assignedValue ?? 0) - (b.assignedValue ?? 0),
  },
};

const TERM_HELP = {
  market: "Round 1 market is the outside expectation for who survives the first series. Higher usually means safer right away.",
  expectedPoints: "Expected points is the first-pass estimate of how many points this team-slot pairing could return if the bracket plays out from here.",
  poolEv: "Pool EV is the rough value score for this team at this rank after blending team strength, path, and how the slot pays out.",
  title: "Championship is the long-run ceiling view. It matters more in the top ranks than the bottom ones.",
  model: "Model is the internal forecast read for this team’s first-round path. It helps you compare our projection with the outside market.",
  value: "Rank is where you place the team on your board. Rank 1 is your strongest slot and rank 16 is your lowest.",
};

function HelpTerm({ label, description }) {
  return (
    <span className="tooltip-wrap tooltip-wrap-inline metric-help">
      <span>{label}</span>
      <span className="help-dot" aria-hidden="true">
        ?
      </span>
      <span className="tooltip-bubble">{description}</span>
    </span>
  );
}

export default function TeamsBoardView() {
  const { profile, session } = useAuth();
  const { memberList } = usePool();
  const [searchParams, setSearchParams] = useSearchParams();
  const { seriesByRound, teamsById } = usePlayoffData();
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const { boardRows, allAssignmentsByUser, boardValidation, completionCount, saveAssignment, saveBoardOrder } = useTeamValueBoard(playoffTeams);
  const [sortKey, setSortKey] = useState("poolEv");
  const [sortDirection, setSortDirection] = useState("desc");
  const [draggingTeamId, setDraggingTeamId] = useState("");
  const [boardViewMode, setBoardViewMode] = useState("drag");
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
        <div className="panel-header nba-board-hero-header">
          <div className="nba-board-hero-copy">
            <h2>{isViewingCurrentUser ? "Build Your Board" : `Read ${selectedViewer?.displayName ?? selectedViewer?.name ?? "this entry"}’s Board`}</h2>
            <p className="nba-board-hero-body">
              {isViewingCurrentUser
                ? boardViewMode === "drag"
                  ? <>Drag teams into rank order.<br />Rank 1 is your strongest slot and rank 16 is your lowest.<br />For more data, switch to Research Table or open Reports.</>
                  : <>Use the table to compare the teams before you decide where each rank belongs.<br />Rank 1 is your strongest slot and rank 16 is your lowest.<br />When you are ready to place them quickly, switch back to Drag / Drop.</>
                : "This board is shown in locked rank order, from rank 1 at the top to rank 16 at the bottom."}
            </p>
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
                    View {member.displayName ?? member.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        <div className="nba-board-entry-strip">
          <span className="chip">
            {isViewingCurrentUser ? `${completionCount}/16 assigned` : `Viewing ${selectedViewer?.displayName ?? selectedViewer?.name ?? "member"}’s board`}
          </span>
        </div>

        <div className="workspace-nav nba-board-workspace-nav">
          <div className="tab-set">
            <button
              type="button"
              className={boardViewMode === "drag" ? "tab active" : "tab"}
              onClick={() => setBoardViewMode("drag")}
            >
              Drag / drop
            </button>
            <button
              type="button"
              className={boardViewMode === "table" ? "tab active" : "tab"}
              onClick={() => setBoardViewMode("table")}
            >
              Research table
            </button>
          </div>
        </div>

        <div className="nba-board-main-layout">
          <div className="nba-board-main-column">
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
                          <HelpTerm label={sortLabel("market")} description={TERM_HELP.market} />
                        </button>
                      </th>
                      <th>
                        <button className="nba-sort-button" type="button" onClick={() => handleSort("title")}>
                          <HelpTerm label={sortLabel("title")} description={TERM_HELP.title} />
                        </button>
                      </th>
                      <th>
                        <button className="nba-sort-button" type="button" onClick={() => handleSort("model")}>
                          <HelpTerm label={sortLabel("model")} description={TERM_HELP.model} />
                        </button>
                      </th>
                      <th>
                        <button className="nba-sort-button" type="button" onClick={() => handleSort("expectedPoints")}>
                          <HelpTerm label={sortLabel("expectedPoints")} description={TERM_HELP.expectedPoints} />
                        </button>
                      </th>
                      <th>
                        <button className="nba-sort-button" type="button" onClick={() => handleSort("poolEv")}>
                          <HelpTerm label={sortLabel("poolEv")} description={TERM_HELP.poolEv} />
                        </button>
                      </th>
                      <th>
                        <button className="nba-sort-button" type="button" onClick={() => handleSort("value")}>
                          <HelpTerm label={sortLabel("value")} description={TERM_HELP.value} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((team) => (
                      <tr key={team.id}>
                        <td>
                          <div className="nba-team-board-team-cell">
                            <strong>{team.city} {team.name}</strong>
                          </div>
                        </td>
                        <td><span className="muted-inline">{team.conference}</span></td>
                        <td><span className="muted-inline">{team.seed}</span></td>
                        <td>{team.marketLean}%</td>
                        <td>{team.titleOddsDisplay} <span className="muted-inline">({team.titleOddsPct}%)</span></td>
                        <td>{team.modelLean}%</td>
                        <td><strong>{team.expectedPoints}</strong></td>
                        <td><strong className="nba-team-board-ev">{team.poolEv}</strong></td>
                        <td>
                          <select
                            className="team-value-select is-primary-control"
                            value={getDisplayRankFromValue(team.assignedValue) ?? ""}
                            onChange={(event) => saveAssignment(team.id, Number(getValueFromDisplayRank(event.target.value)))}
                            aria-label={`Assign rank for ${team.city} ${team.name}`}
                            disabled={!isViewingCurrentUser}
                          >
                            <option value="" disabled>Rank</option>
                            {TEAM_VALUE_DISPLAY_RANKS.map((rank) => (
                              <option key={rank} value={rank}>
                                {rank}
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
                    <span className="board-rank">{getDisplayRankFromValue(team.assignedValue)}</span>
                    <div className="board-player">
                      <div className="board-player-meta">
                        <span className="chip subtle-chip board-meta-pill">{team.conference}</span>
                        <span className="chip subtle-chip board-meta-pill">Seed {team.seed}</span>
                        <span className="assign-tag board-meta-pill board-meta-pill-accent">{team.abbreviation}</span>
                      </div>
                      <strong>{team.city} {team.name}</strong>
                    </div>
                    <div className="board-row-metrics">
                      <span>
                        <strong>{team.marketLean}%</strong>
                        <small>R1 market</small>
                      </span>
                      <span>
                        <strong>{team.expectedPoints}</strong>
                        <small>Expected pts</small>
                      </span>
                      <span>
                        <strong>{team.poolEv}</strong>
                        <small>Pool EV</small>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="nba-board-side-rail">
            <article className="detail-card inset-card">
              <span className="micro-label">Board status</span>
              <p>
                {isViewingCurrentUser && boardValidation.valid
                  ? <><strong>Complete.</strong> You can still reshuffle it until lock.</>
                  : isViewingCurrentUser
                    ? `${completionCount}/16 ranks are filled. Keep going until every slot is assigned.`
                    : "This is a locked, read-only board."}
              </p>
            </article>

            <article className="detail-card inset-card nba-board-rail-card reports-card">
              <span className="micro-label">Need more detail?</span>
              <p>Open reports if you want sharper research before you settle the trickiest slots.</p>
              <Link className="secondary-button full" to="/reports">
                Open Reports
              </Link>
            </article>

            <article className="detail-card inset-card nba-board-rail-card scoring-card">
              <span className="micro-label">Scoring guide</span>
              <p>See the clean point map by rank, round, and series length.</p>
              <Link className="secondary-button full" to="/scoring">
                Open Scoring
              </Link>
            </article>
          </aside>
        </div>
      </section>
    </div>
  );
}

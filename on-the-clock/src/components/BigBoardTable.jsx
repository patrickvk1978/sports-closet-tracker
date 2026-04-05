import { useEffect, useMemo, useState } from "react";
import { useReferenceData } from "../hooks/useReferenceData";
import { SkeletonBoardTable } from "./Skeleton";
import EmptyState from "./EmptyState";

function sortProspects(prospects, boardIds, sortBy) {
  const getBoardRank = (prospectId) => boardIds.indexOf(prospectId) + 1;

  const comparators = {
    your_rank: (a, b) => getBoardRank(a.id) - getBoardRank(b.id),
    player: (a, b) => a.name.localeCompare(b.name),
    position: (a, b) => a.position.localeCompare(b.position),
    school: (a, b) => a.school.localeCompare(b.school),
    consensus: (a, b) => (a.consensus_rank ?? 999) - (b.consensus_rank ?? 999),
    espn: (a, b) => (a.espn_rank ?? 999) - (b.espn_rank ?? 999),
    pff: (a, b) => (a.pff_rank ?? 999) - (b.pff_rank ?? 999),
    ringer: (a, b) => (a.ringer_rank ?? 999) - (b.ringer_rank ?? 999),
    athletic: (a, b) => (a.athletic_rank ?? 999) - (b.athletic_rank ?? 999),
  };

  return [...prospects].sort(comparators[sortBy] ?? comparators.your_rank);
}

export default function BigBoardTable({
  title = "Big Board",
  subtitle = "Sortable strategy workspace",
  boardIds,
  onMove,
  draftedIds = new Set(),
  mappedPickByProspectId = {},
  selectedPickLabel,
  assignLabel = "Make Current Pick",
  onAssignSelectedProspect,
}) {
  const { getProspectById, loading: refLoading } = useReferenceData();
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("your_rank");
  const [selectedProspectId, setSelectedProspectId] = useState(boardIds[0] ?? null);

  useEffect(() => {
    if (!selectedProspectId && boardIds.length > 0) {
      setSelectedProspectId(boardIds[0]);
    }
  }, [boardIds, selectedProspectId]);

  const visibleProspects = useMemo(() => {
    const ordered = boardIds.map(getProspectById).filter(Boolean);
    const filtered = ordered.filter((prospect) => {
      const matchesSearch = prospect.name.toLowerCase().includes(search.toLowerCase());
      const matchesPosition = positionFilter === "ALL" || prospect.position.includes(positionFilter);
      return matchesSearch && matchesPosition;
    });
    return sortProspects(filtered, boardIds, sortBy);
  }, [boardIds, positionFilter, search, sortBy, getProspectById]);

  const selectedProspect = selectedProspectId ? getProspectById(selectedProspectId) : null;
  const assignedCount = Object.keys(mappedPickByProspectId).length;
  const draftedCount = boardIds.filter((prospectId) => draftedIds.has(prospectId)).length;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="label">{title}</span>
          <h2>{subtitle}</h2>
        </div>
      </div>

      <div className="board-summary-bar">
        <span className="chip">Assigned {assignedCount}</span>
        <span className="chip">Available {boardIds.length - draftedCount}</span>
        <span className="chip">Drafted {draftedCount}</span>
      </div>

      <div className="filter-row board-filter-row">
        <input
          className="search-input"
          placeholder="Search player"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
          <option value="ALL">All positions</option>
          <option value="QB">QB</option>
          <option value="WR">WR</option>
          <option value="OT">OT</option>
          <option value="EDGE">EDGE</option>
          <option value="CB">CB</option>
          <option value="DT">DT</option>
          <option value="RB">RB</option>
        </select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="your_rank">Your Rank</option>
          <option value="consensus">Consensus</option>
          <option value="espn">ESPN ScoutsINC</option>
          <option value="pff">PFF</option>
          <option value="ringer">The Ringer</option>
          <option value="athletic">The Athletic</option>
        </select>
      </div>

      <div className="board-action-bar">
        <div>
          <span className="micro-label">Selected player</span>
          <strong>{selectedProspect?.name ?? "Choose a player"}</strong>
          <p className="subtle">{selectedPickLabel ? `Currently mapping to ${selectedPickLabel}` : "Use the Big Board to support live picks, predictions, and auto-submit behavior."}</p>
        </div>
        {onAssignSelectedProspect ? (
          <button
            className="primary-button"
            type="button"
            disabled={!selectedProspect}
            onClick={() => selectedProspect && onAssignSelectedProspect(selectedProspect.id)}
          >
            {assignLabel}
          </button>
        ) : null}
      </div>

      {refLoading ? (
        <SkeletonBoardTable count={6} />
      ) : visibleProspects.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No players found"
          body={boardIds.length === 0 ? "Prospects will appear here once synced." : "Try a different search or position filter."}
        />
      ) : (
      <div className="board-table">
        <div className="board-table-head">
          <span>Rank</span>
          <span>Player</span>
          <span>Pos</span>
          <span>School</span>
          <span>Status</span>
          <span></span>
        </div>
        {visibleProspects.map((prospect) => {
          const yourRank = boardIds.indexOf(prospect.id) + 1;
          const selected = selectedProspectId === prospect.id;
          const drafted = draftedIds.has(prospect.id);
          return (
            <div
              key={prospect.id}
              className={selected ? "board-row selected" : "board-row"}
              onClick={() => setSelectedProspectId(prospect.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedProspectId(prospect.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="board-rank">{yourRank}</span>
              <span className="board-player">
                <strong>{prospect.name}</strong>
                {mappedPickByProspectId[prospect.id] ? <span className="assign-pill">{mappedPickByProspectId[prospect.id]}</span> : null}
              </span>
              <span>{prospect.position}</span>
              <span>{prospect.school}</span>
              <span className={drafted ? "board-status drafted" : "board-status available"}>
                {drafted ? "Drafted" : "Available"}
              </span>
              <span className="board-row-actions">
                <button className="small-button" type="button" onClick={(event) => { event.stopPropagation(); onMove(prospect.id, "up"); }}>↑</button>
                <button className="small-button" type="button" onClick={(event) => { event.stopPropagation(); onMove(prospect.id, "down"); }}>↓</button>
              </span>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

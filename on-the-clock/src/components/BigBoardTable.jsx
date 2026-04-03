import { useEffect, useMemo, useState } from "react";
import { PROSPECTS, getProspectById } from "../lib/draftData";

function sortProspects(prospects, boardIds, sortBy) {
  const getBoardRank = (prospectId) => boardIds.indexOf(prospectId) + 1;

  const comparators = {
    your_rank: (a, b) => getBoardRank(a.id) - getBoardRank(b.id),
    player: (a, b) => a.name.localeCompare(b.name),
    position: (a, b) => a.position.localeCompare(b.position),
    school: (a, b) => a.school.localeCompare(b.school),
    consensus: (a, b) => a.consensus - b.consensus,
    espn: (a, b) => a.espn - b.espn,
    pff: (a, b) => a.pff - b.pff,
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
  }, [boardIds, positionFilter, search, sortBy]);

  const selectedProspect = selectedProspectId ? getProspectById(selectedProspectId) : null;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="label">{title}</span>
          <h2>{subtitle}</h2>
        </div>
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
          <option value="your_rank">Your rank</option>
          <option value="consensus">Consensus</option>
          <option value="player">Player</option>
          <option value="position">Position</option>
          <option value="school">School</option>
          <option value="espn">ESPN</option>
          <option value="pff">PFF</option>
        </select>
      </div>

      <div className="board-action-bar">
        <div>
          <span className="micro-label">Selected player</span>
          <strong>{selectedProspect?.name ?? "Choose a player"}</strong>
          <p className="subtle">{selectedPickLabel ? `Mapped to ${selectedPickLabel}` : "Use your board to support live picks and predictions."}</p>
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

      <div className="board-table">
        <div className="board-table-head">
          <span>Rank</span>
          <span>Player</span>
          <span>Pos</span>
          <span>School</span>
          <span>Your</span>
          <span>Cons</span>
          <span>Sources</span>
          <span>Range</span>
          <span>Status</span>
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
              <span>{yourRank}</span>
              <span>{prospect.consensus}</span>
              <span>{`E${prospect.espn} · P${prospect.pff}`}</span>
              <span>{prospect.predictedRange}</span>
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
    </section>
  );
}

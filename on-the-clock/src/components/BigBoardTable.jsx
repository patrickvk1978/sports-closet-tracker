import { useEffect, useMemo, useState } from "react";
import { useReferenceData } from "../hooks/useReferenceData";
import { SkeletonBoardTable } from "./Skeleton";
import EmptyState from "./EmptyState";

const RANK_SOURCES = [
  { value: "your_rank",      label: "Your Rank",       field: null },
  { value: "consensus_avg",  label: "Expert Consensus", field: null },
  { value: "espn",           label: "ESPN ScoutsINC",   field: "espn_rank" },
  { value: "pff",            label: "PFF",              field: "pff_rank" },
  { value: "ringer_board",   label: "Ringer Board",     field: "ringer_rank" },
  { value: "athletic_board", label: "Athletic Board",   field: "athletic_rank" },
];

const MOCK_SOURCES = [
  { value: "consensus_mock", label: "Consensus Mock",  field: "consensus_mock_pick" },
  { value: "ringer_mock",    label: "Ringer Mock",     field: "ringer_mock_pick" },
  { value: "athletic_mock",  label: "Athletic Mock",   field: "athletic_mock_pick" },
  { value: "pff_mock",       label: "PFF Mock",        field: "pff_mock_pick" },
];

function expertConsensusRank(p) {
  const ranks = [p.espn_rank, p.pff_rank, p.ringer_rank, p.athletic_rank].filter(Boolean);
  if (!ranks.length) return 9999;
  return ranks.reduce((s, r) => s + r, 0) / ranks.length;
}

function sortRankings(prospects, boardIds, source) {
  const idx = (id) => { const i = boardIds.indexOf(id); return i === -1 ? 9999 : i; };
  const sorted = [...prospects];
  if (source === "your_rank") return sorted.sort((a, b) => idx(a.id) - idx(b.id));
  if (source === "consensus_avg") return sorted.sort((a, b) => expertConsensusRank(a) - expertConsensusRank(b));
  const cfg = RANK_SOURCES.find(s => s.value === source);
  if (cfg?.field) return sorted.sort((a, b) => (a[cfg.field] ?? 9999) - (b[cfg.field] ?? 9999));
  return sorted;
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
  const { prospects, picks, teams, getProspectById, loading: refLoading } = useReferenceData();
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState("rankings");
  const [rankSource, setRankSource] = useState("your_rank");
  const [mockSource, setMockSource] = useState("consensus_mock");
  const [selectedProspectId, setSelectedProspectId] = useState(boardIds[0] ?? null);

  useEffect(() => {
    if (!selectedProspectId && boardIds.length > 0) setSelectedProspectId(boardIds[0]);
  }, [boardIds, selectedProspectId]);

  // Rankings mode: filter to source-ranked players only (except your_rank / consensus_avg)
  const rankSourceCfg = RANK_SOURCES.find(s => s.value === rankSource);
  const mockSourceCfg = MOCK_SOURCES.find(s => s.value === mockSource);

  const rankingProspects = useMemo(() => {
    const base = boardIds.map(getProspectById).filter(Boolean);
    const filtered = base.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchPos = positionFilter === "ALL" || p.position.includes(positionFilter);
      return matchSearch && matchPos;
    });
    // If source has a field, only show players with that rank
    const sourceFiltered = rankSourceCfg?.field
      ? filtered.filter(p => p[rankSourceCfg.field] != null)
      : filtered;
    return sortRankings(sourceFiltered, boardIds, rankSource);
  }, [boardIds, positionFilter, search, rankSource, rankSourceCfg, getProspectById]);

  // Mock mode: all prospects with that mock pick, sorted by pick number
  const mockProspects = useMemo(() => {
    if (!mockSourceCfg?.field || !prospects.length) return [];
    return prospects
      .filter(p => p[mockSourceCfg.field] != null)
      .sort((a, b) => a[mockSourceCfg.field] - b[mockSourceCfg.field]);
  }, [prospects, mockSourceCfg]);

  const selectedProspect = selectedProspectId ? getProspectById(selectedProspectId) : null;
  const assignedCount = Object.keys(mappedPickByProspectId).length;
  const draftedCount = boardIds.filter(id => draftedIds.has(id)).length;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="label">{title}</span>
          <h2>{subtitle}</h2>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="board-mode-toggle">
        <button
          className={viewMode === "rankings" ? "toggle-btn active" : "toggle-btn"}
          type="button"
          onClick={() => setViewMode("rankings")}
        >
          Rankings
        </button>
        <button
          className={viewMode === "mocks" ? "toggle-btn active" : "toggle-btn"}
          type="button"
          onClick={() => setViewMode("mocks")}
        >
          Mock Drafts
        </button>
      </div>

      {viewMode === "rankings" && (
        <div className="board-summary-bar">
          <span className="chip">Assigned {assignedCount}</span>
          <span className="chip">Available {boardIds.length - draftedCount}</span>
          <span className="chip">Drafted {draftedCount}</span>
        </div>
      )}

      <div className="filter-row board-filter-row">
        {viewMode === "rankings" && (
          <input
            className="search-input"
            placeholder="Search player"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {viewMode === "rankings" && (
          <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
            <option value="ALL">All positions</option>
            <option value="QB">QB</option>
            <option value="WR">WR</option>
            <option value="OT">OT</option>
            <option value="EDGE">EDGE</option>
            <option value="CB">CB</option>
            <option value="DT">DT</option>
            <option value="RB">RB</option>
            <option value="LB">LB</option>
            <option value="S">S</option>
            <option value="TE">TE</option>
          </select>
        )}
        {viewMode === "rankings" ? (
          <select value={rankSource} onChange={(e) => setRankSource(e.target.value)}>
            {RANK_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        ) : (
          <select value={mockSource} onChange={(e) => setMockSource(e.target.value)}>
            {MOCK_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
      </div>

      {/* Rankings mode: player select + assign */}
      {viewMode === "rankings" && (
        <div className="board-action-bar">
          <div>
            <span className="micro-label">Selected player</span>
            <strong>{selectedProspect?.name ?? "Choose a player"}</strong>
            <p className="subtle">
              {selectedPickLabel
                ? `Currently mapping to ${selectedPickLabel}`
                : "Use the Big Board to support live picks, predictions, and auto-submit behavior."}
            </p>
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
      )}

      {refLoading ? (
        <SkeletonBoardTable count={6} />
      ) : viewMode === "rankings" ? (
        rankingProspects.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No players found"
            body={boardIds.length === 0 ? "Prospects will appear here once synced." : "Try a different search or filter."}
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
            {rankingProspects.map((prospect) => {
              const yourRank = boardIds.indexOf(prospect.id) + 1;
              const selected = selectedProspectId === prospect.id;
              const drafted = draftedIds.has(prospect.id);
              const predicted = !drafted && !!mappedPickByProspectId[prospect.id];
              const displayRank = rankSourceCfg?.field ? (prospect[rankSourceCfg.field] ?? "—") : yourRank;
              return (
                <div
                  key={prospect.id}
                  className={selected ? "board-row selected" : "board-row"}
                  onClick={() => setSelectedProspectId(prospect.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedProspectId(prospect.id); } }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="board-rank">{displayRank}</span>
                  <span className="board-player">
                    <strong>{prospect.name}</strong>
                    {mappedPickByProspectId[prospect.id] ? <span className="assign-pill">{mappedPickByProspectId[prospect.id]}</span> : null}
                  </span>
                  <span>{prospect.position}</span>
                  <span>{prospect.school}</span>
                  <span className={drafted ? "board-status drafted" : predicted ? "board-status predicted" : "board-status available"}>
                    {drafted ? "Drafted" : predicted ? "Predicted" : "Available"}
                  </span>
                  <span className="board-row-actions">
                    <button className="small-button" type="button" onClick={(e) => { e.stopPropagation(); onMove(prospect.id, "up"); }}>↑</button>
                    <button className="small-button" type="button" onClick={(e) => { e.stopPropagation(); onMove(prospect.id, "down"); }}>↓</button>
                  </span>
                </div>
              );
            })}
          </div>
        )
      ) : (
        mockProspects.length === 0 ? (
          <EmptyState icon="📋" title="No mock data" body="Sync prospects from the Admin page to load mock draft picks." />
        ) : (
          <div className="board-table mock-table">
            <div className="board-table-head mock-table-head">
              <span>Pick</span>
              <span>Team</span>
              <span>Player</span>
              <span>Pos</span>
              <span>School</span>
            </div>
            {mockProspects.map((prospect) => {
              const pickNum = prospect[mockSourceCfg.field];
              const pickInfo = picks.find(p => p.number === pickNum);
              const teamName = teams[pickInfo?.currentTeam]?.name ?? pickInfo?.currentTeam ?? "—";
              return (
                <div key={prospect.id} className="board-row mock-row">
                  <span className="board-rank">{pickNum}</span>
                  <span className="mock-team">{teamName}</span>
                  <span className="board-player"><strong>{prospect.name}</strong></span>
                  <span>{prospect.position}</span>
                  <span>{prospect.school}</span>
                </div>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}

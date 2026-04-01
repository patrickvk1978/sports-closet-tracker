import { useMemo, useState } from "react";

const TEAMS = {
  TEN: { name: "Titans", needs: ["QB", "EDGE", "WR"] },
  CLE: { name: "Browns", needs: ["QB", "OT", "RB"] },
  NYG: { name: "Giants", needs: ["QB", "WR", "CB"] },
  NE: { name: "Patriots", needs: ["OT", "WR", "CB"] },
  JAX: { name: "Jaguars", needs: ["DT", "CB", "WR"] },
  LV: { name: "Raiders", needs: ["QB", "CB", "RB"] },
  NYJ: { name: "Jets", needs: ["TE", "RT", "DT"] },
  CAR: { name: "Panthers", needs: ["EDGE", "WR", "S"] },
  NO: { name: "Saints", needs: ["OT", "WR", "QB"] },
  CHI: { name: "Bears", needs: ["OT", "EDGE", "DT"] },
  SF: { name: "49ers", needs: ["CB", "OL", "DT"] },
  DAL: { name: "Cowboys", needs: ["RB", "OT", "DT"] },
};

const PROSPECTS = [
  { id: "cam-ward", name: "Cam Ward", position: "QB", school: "Miami", consensus: 1, espn: 1, pff: 2, dane: 1, notes: "Creative off-platform thrower with starter traits and top-of-board buzz." },
  { id: "travis-hunter", name: "Travis Hunter", position: "CB/WR", school: "Colorado", consensus: 2, espn: 2, pff: 1, dane: 2, notes: "True two-way star. Elite ball skills and instant spotlight value." },
  { id: "abdul-carter", name: "Abdul Carter", position: "EDGE", school: "Penn State", consensus: 3, espn: 3, pff: 4, dane: 3, notes: "Explosive pass-rusher who consistently shows up in top-three scenarios." },
  { id: "tet-mcmillan", name: "Tetairoa McMillan", position: "WR", school: "Arizona", consensus: 4, espn: 5, pff: 3, dane: 5, notes: "Boundary receiver with size, catch radius, and red-zone gravity." },
  { id: "will-campbell", name: "Will Campbell", position: "OT", school: "LSU", consensus: 5, espn: 4, pff: 6, dane: 4, notes: "High-floor tackle prospect and frequent fit for tackle-needy teams." },
  { id: "mason-graham", name: "Mason Graham", position: "DT", school: "Michigan", consensus: 6, espn: 7, pff: 5, dane: 6, notes: "Quick disruptive interior defender with day-one impact profile." },
  { id: "ashton-jeanty", name: "Ashton Jeanty", position: "RB", school: "Boise State", consensus: 7, espn: 6, pff: 7, dane: 8, notes: "Feature back talent who could crash the top ten in the right script." },
  { id: "will-johnson", name: "Will Johnson", position: "CB", school: "Michigan", consensus: 8, espn: 9, pff: 9, dane: 7, notes: "Long corner with clear CB1 upside and sticky coverage traits." },
  { id: "mykel-williams", name: "Mykel Williams", position: "EDGE", school: "Georgia", consensus: 9, espn: 10, pff: 10, dane: 9, notes: "Traits-heavy edge defender who fits several pressure-needy teams." },
  { id: "jalen-milroe", name: "Jalen Milroe", position: "QB", school: "Alabama", consensus: 10, espn: 12, pff: 14, dane: 11, notes: "High-variance quarterback with movement skills and upside appeal." },
  { id: "malaki-starks", name: "Malaki Starks", position: "S", school: "Georgia", consensus: 11, espn: 11, pff: 12, dane: 10, notes: "Versatile safety who brings range and coverage flexibility." },
  { id: "colston-loveland", name: "Colston Loveland", position: "TE", school: "Michigan", consensus: 12, espn: 13, pff: 11, dane: 12, notes: "Modern receiving tight end who changes the middle of the field." },
  { id: "kelvin-banks", name: "Kelvin Banks Jr.", position: "OT", school: "Texas", consensus: 13, espn: 14, pff: 8, dane: 13, notes: "Athletic tackle with some of the strongest board variance in the class." },
  { id: "walter-nolen", name: "Walter Nolen", position: "DT", school: "Ole Miss", consensus: 14, espn: 15, pff: 13, dane: 15, notes: "Penetrating interior lineman with splash-play upside." },
];

const INITIAL_PICKS = [
  { number: 1, originalTeam: "TEN", currentTeam: "TEN", status: "on_clock", actual: null, trade: null },
  { number: 2, originalTeam: "CLE", currentTeam: "CLE", status: "pending", actual: null, trade: null },
  { number: 3, originalTeam: "NYG", currentTeam: "NYG", status: "pending", actual: null, trade: null },
  { number: 4, originalTeam: "NE", currentTeam: "NE", status: "pending", actual: null, trade: null },
  { number: 5, originalTeam: "JAX", currentTeam: "JAX", status: "pending", actual: null, trade: null },
  { number: 6, originalTeam: "LV", currentTeam: "LV", status: "pending", actual: null, trade: null },
  { number: 7, originalTeam: "NYJ", currentTeam: "CHI", status: "pending", actual: null, trade: "Trade framework: Bears move up" },
  { number: 8, originalTeam: "CAR", currentTeam: "CAR", status: "pending", actual: null, trade: null },
  { number: 9, originalTeam: "NO", currentTeam: "NO", status: "pending", actual: null, trade: null },
  { number: 10, originalTeam: "CHI", currentTeam: "NYJ", status: "pending", actual: null, trade: "Trade framework: Jets slide back" },
  { number: 11, originalTeam: "SF", currentTeam: "SF", status: "pending", actual: null, trade: null },
  { number: 12, originalTeam: "DAL", currentTeam: "DAL", status: "pending", actual: null, trade: null },
];

const INITIAL_PREDICTIONS = {
  1: "cam-ward",
  2: "travis-hunter",
  3: "abdul-carter",
  4: "will-campbell",
  5: "mason-graham",
  6: "ashton-jeanty",
  7: "tet-mcmillan",
  8: "mykel-williams",
  9: "kelvin-banks",
  10: "colston-loveland",
  11: "will-johnson",
  12: "walter-nolen",
};

const SCOREBOARD = [
  { name: "Patrick", exact: 0, position: 0, points: 0, projected: "+11" },
  { name: "Sarah", exact: 0, position: 0, points: 0, projected: "+9" },
  { name: "Davin", exact: 0, position: 0, points: 0, projected: "+8" },
  { name: "Maya", exact: 0, position: 0, points: 0, projected: "+7" },
];

const POOL_LOCKS = [
  { name: "Patrick", status: "locked", pick: "Cam Ward", result: "exact" },
  { name: "Sarah", status: "locked", pick: "Cam Ward", result: "exact" },
  { name: "Davin", status: "waiting", pick: null, result: null },
  { name: "Maya", status: "locked", pick: "Travis Hunter", result: "miss" },
  { name: "Susan", status: "waiting", pick: null, result: null },
  { name: "Matt", status: "locked", pick: "Abdul Carter", result: "position" },
];

const MOCK_SCOREBOARD = [
  { name: "Patrick", points: 9, picksScored: 4, trend: "+3" },
  { name: "Sarah", points: 8, picksScored: 4, trend: "+2" },
  { name: "Davin", points: 6, picksScored: 4, trend: "+1" },
  { name: "Maya", points: 5, picksScored: 4, trend: "+1" },
  { name: "Susan", points: 4, picksScored: 4, trend: "+0" },
];

const MOCK_TRACKING_ROWS = [
  {
    pick: 3,
    team: "NYG",
    actual: "Abdul Carter",
    me: { player: "Abdul Carter", state: "exact", score: "+3" },
    opponents: [
      { name: "Sarah", player: "Abdul Carter", state: "exact" },
      { name: "Davin", player: "Travis Hunter", state: "miss" },
      { name: "Maya", player: "Abdul Carter", state: "exact" },
      { name: "Susan", player: "Jalen Milroe", state: "miss" },
    ],
  },
  {
    pick: 4,
    team: "NE",
    actual: "Will Campbell",
    me: { player: "Tetairoa McMillan", state: "near", score: "+1" },
    opponents: [
      { name: "Sarah", player: "Will Campbell", state: "exact" },
      { name: "Davin", player: "Kelvin Banks Jr.", state: "near" },
      { name: "Maya", player: "Will Campbell", state: "exact" },
      { name: "Susan", player: "Tetairoa McMillan", state: "near" },
    ],
  },
  {
    pick: 5,
    team: "JAX",
    actual: null,
    me: { player: "Mason Graham", state: "current", score: null },
    opponents: [
      { name: "Sarah", player: "Mason Graham", state: "current" },
      { name: "Davin", player: "Will Johnson", state: "alive" },
      { name: "Maya", player: "Mason Graham", state: "current" },
      { name: "Susan", player: "Mykel Williams", state: "alive" },
    ],
  },
  {
    pick: 6,
    team: "LV",
    actual: null,
    me: { player: "Ashton Jeanty", state: "alive", score: null },
    opponents: [
      { name: "Sarah", player: "Ashton Jeanty", state: "alive" },
      { name: "Davin", player: "Jalen Milroe", state: "alive" },
      { name: "Maya", player: "Ashton Jeanty", state: "alive" },
      { name: "Susan", player: "Ashton Jeanty", state: "alive" },
    ],
  },
  {
    pick: 7,
    team: "CHI",
    actual: null,
    me: { player: "Tetairoa McMillan", state: "alive", score: null },
    opponents: [
      { name: "Sarah", player: "Tetairoa McMillan", state: "alive" },
      { name: "Davin", player: "Will Johnson", state: "alive" },
      { name: "Maya", player: "Mykel Williams", state: "alive" },
      { name: "Susan", player: "Tetairoa McMillan", state: "alive" },
    ],
  },
];

function getProspect(id) {
  return PROSPECTS.find((prospect) => prospect.id === id) ?? null;
}

function resolveBoardFallback({ boardIds, takenIds, teamCode, fallbackMode }) {
  const available = boardIds
    .map(getProspect)
    .filter(Boolean)
    .filter((prospect) => !takenIds.has(prospect.id));

  if (!available.length) return null;
  if (fallbackMode === "queue_only") return available[0];

  const needs = new Set(TEAMS[teamCode]?.needs ?? []);
  const needMatch = available.find((prospect) => {
    const positions = prospect.position.split("/");
    return positions.some((position) => needs.has(position));
  });

  return needMatch ?? available[0];
}

function buildPickStatus({ pick, prediction, takenIds, boardIds, fallbackMode, manualPickId }) {
  const predictionProspect = prediction ? getProspect(prediction) : null;
  const manualProspect = manualPickId ? getProspect(manualPickId) : null;
  const fallbackProspect = resolveBoardFallback({ boardIds, takenIds, teamCode: pick.currentTeam, fallbackMode });

  if (manualProspect && !takenIds.has(manualProspect.id)) {
    return { effective: manualProspect, label: "Manual override", detail: "Live draft-night change will lock if the pick happens now." };
  }

  if (predictionProspect && !takenIds.has(predictionProspect.id)) {
    return {
      effective: predictionProspect,
      label: pick.currentTeam !== pick.originalTeam ? "Prediction still valid after trade" : "Prediction valid",
      detail: "Your slot prediction remains available.",
    };
  }

  if (!fallbackProspect) {
    return { effective: null, label: "No available fallback", detail: "Board is exhausted or unresolved." };
  }

  return {
    effective: fallbackProspect,
    label: fallbackMode === "queue_only" ? "Auto from board" : "Need match from board",
    detail: fallbackMode === "queue_only"
      ? "Highest remaining player on your big board."
      : `Highest remaining player on your board who matches a ${TEAMS[pick.currentTeam]?.name} need.`,
  };
}

function ProspectPill({ prospect }) {
  if (!prospect) return <span className="pill neutral">Open slot</span>;
  return (
    <span className="prospect-pill">
      <span>{prospect.name}</span>
      <span className="pill-meta">{prospect.position}</span>
    </span>
  );
}

function PoolPicker() {
  return (
    <button className="pool-picker" type="button">
      <span className="micro-label">Pool</span>
      <strong>Friday Night Room</strong>
      <span className="pool-picker-caret">▾</span>
    </button>
  );
}

function TopBar({ title, onBack }) {
  return (
    <header className="hero hero-simple">
      <div className="title-wrap">
        {onBack ? (
          <button className="back-link" type="button" onClick={onBack}>
            ← All pool types
          </button>
        ) : null}
        <h1>{title}</h1>
      </div>
      <PoolPicker />
    </header>
  );
}

function LeaderboardTable() {
  return (
    <div className="leaderboard-table">
      <div className="leaderboard-head">
        <span>Pool standings</span>
        <span>Exact</span>
        <span>Pos</span>
        <span>Pts</span>
        <span>Proj</span>
      </div>
      {SCOREBOARD.map((player, index) => (
        <div className={index === 0 ? "leaderboard-row top" : "leaderboard-row"} key={player.name}>
          <span className="leaderboard-player">
            <strong>{index + 1}</strong>
            <span>{player.name}</span>
          </span>
          <span>{player.exact}</span>
          <span>{player.position}</span>
          <span className="points-strong">{player.points}</span>
          <span className="projection-chip">{player.projected}</span>
        </div>
      ))}
    </div>
  );
}

function PoolStatusGrid({ revealed = false }) {
  return (
    <div className="pool-status-grid">
      {POOL_LOCKS.map((entry) => (
        <div
          key={entry.name}
          className={
            revealed && entry.result
              ? `pool-member-card revealed ${entry.result}`
              : `pool-member-card ${entry.status}`
          }
        >
          <strong>{entry.name}</strong>
          {!revealed ? <span>{entry.status === "locked" ? "Locked in" : "Waiting"}</span> : <span>{entry.pick ?? "No pick"}</span>}
        </div>
      ))}
    </div>
  );
}

function SelectionScreen({ onSelect }) {
  return (
    <div className="screen-stack">
      <TopBar title="On the Clock" />
      <section className="panel selection-panel">
        <div className="panel-header">
          <div>
            <span className="label">Create pool</span>
            <h2>Choose the game type</h2>
          </div>
          <span className="subtle">Name + short description + bullets gives people enough information to self-sort quickly.</span>
        </div>

        <div className="mode-grid">
          <button className="mode-card" type="button" onClick={() => onSelect("live")}>
            <span className="label">Live Draft</span>
            <h3>Make picks during the draft, react to trades, and compete in real time.</h3>
            <ul className="mode-bullets">
              <li>Edit picks live as teams come on the clock</li>
              <li>Use your big board and team-need suggestions</li>
              <li>Can still auto-pick from your board if you step away</li>
              <li>Best for highly engaged draft-night groups</li>
            </ul>
            <span className="mode-link">Open live wireframe →</span>
          </button>

          <button className="mode-card" type="button" onClick={() => onSelect("mock")}>
            <span className="label">Mock Challenge</span>
            <h3>Submit your Round 1 predictions before the draft and watch the results unfold live.</h3>
            <ul className="mode-bullets">
              <li>Fill out your picks once before the deadline</li>
              <li>No need to be online during the draft</li>
              <li>Closest to a bracket-pool experience</li>
              <li>Best for larger or more casual groups</li>
            </ul>
            <span className="mode-link">Open mock wireframe →</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function LiveDraftWireframe({ onBack }) {
  const [activeTab, setActiveTab] = useState("draft");
  const [selectedPick, setSelectedPick] = useState(1);
  const [fallbackMode, setFallbackMode] = useState("queue_plus_team_need");
  const [boardIds, setBoardIds] = useState([...PROSPECTS].sort((a, b) => a.consensus - b.consensus).map((prospect) => prospect.id));
  const [predictions, setPredictions] = useState(INITIAL_PREDICTIONS);
  const [manualPicks, setManualPicks] = useState({});
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [boardSort, setBoardSort] = useState("my_board");

  const takenIds = useMemo(() => new Set(INITIAL_PICKS.filter((pick) => pick.actual).map((pick) => pick.actual)), []);

  const visibleProspects = useMemo(() => {
    const ordered = boardIds.map(getProspect).filter(Boolean);
    const filtered = ordered.filter((prospect) => positionFilter === "ALL" || prospect.position.includes(positionFilter));
    const sorters = {
      my_board: (a, b) => boardIds.indexOf(a.id) - boardIds.indexOf(b.id),
      consensus: (a, b) => a.consensus - b.consensus,
      espn: (a, b) => a.espn - b.espn,
      pff: (a, b) => a.pff - b.pff,
    };
    return [...filtered].sort(sorters[boardSort]);
  }, [boardIds, positionFilter, boardSort]);

  const selectedPickData = INITIAL_PICKS.find((pick) => pick.number === selectedPick) ?? INITIAL_PICKS[0];
  const selectedPrediction = predictions[selectedPickData.number];
  const selectedManual = manualPicks[selectedPickData.number];
  const selectedStatus = buildPickStatus({
    pick: selectedPickData,
    prediction: selectedPrediction,
    takenIds,
    boardIds,
    fallbackMode,
    manualPickId: selectedManual,
  });

  const queueSuggestion = resolveBoardFallback({ boardIds, takenIds, teamCode: selectedPickData.currentTeam, fallbackMode: "queue_only" });
  const needSuggestion = resolveBoardFallback({ boardIds, takenIds, teamCode: selectedPickData.currentTeam, fallbackMode: "queue_plus_team_need" });

  function assignPlayerToPick(prospectId, pickNumber) {
    setPredictions((current) => ({ ...current, [pickNumber]: prospectId }));
    setActiveTab("draft");
    setSelectedPick(pickNumber);
  }

  function applySuggestion(prospectId) {
    setManualPicks((current) => ({ ...current, [selectedPick]: prospectId }));
  }

  function moveBoardItem(prospectId, direction) {
    setBoardIds((current) => {
      const index = current.indexOf(prospectId);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  return (
    <div className="screen-stack">
      <TopBar title="On the Clock" onBack={onBack} />

      <section className="workspace-nav">
        <div className="tab-set">
          <button className={activeTab === "draft" ? "tab active" : "tab"} onClick={() => setActiveTab("draft")}>Draft</button>
          <button className={activeTab === "board" ? "tab active" : "tab"} onClick={() => setActiveTab("board")}>Board</button>
        </div>
        <div className="tab-actions">
          <span className="chip">Exact player: 5</span>
          <span className="chip">Position: 2</span>
          <div className="toggle-group">
            <button className={fallbackMode === "queue_only" ? "mini-toggle active" : "mini-toggle"} onClick={() => setFallbackMode("queue_only")}>Queue only</button>
            <button className={fallbackMode === "queue_plus_team_need" ? "mini-toggle active" : "mini-toggle"} onClick={() => setFallbackMode("queue_plus_team_need")}>Need match</button>
          </div>
        </div>
      </section>

      {activeTab === "draft" ? (
        <div className="draft-layout">
          <section className="panel board-panel">
            <div className="hero-modules">
              <div className="detail-card spotlight your-pick-module">
                <div className="module-header">
                  <div>
                    <span className="label">Your pick</span>
                    <h2>Pick {selectedPickData.number}</h2>
                  </div>
                  <span className="status-badge">{selectedStatus.label}</span>
                </div>

                <div className="your-pick-primary">
                  <div>
                    <span className="micro-label">Current selection</span>
                    <ProspectPill prospect={getProspect(selectedManual ?? selectedPrediction)} />
                  </div>
                  <p>{selectedStatus.detail}</p>
                </div>

                <div className="your-pick-suggestions">
                  <button className="suggestion-card" onClick={() => queueSuggestion && applySuggestion(queueSuggestion.id)}>
                    <span className="micro-label">Best available from your board</span>
                    <ProspectPill prospect={queueSuggestion} />
                  </button>
                  <button className="suggestion-card" onClick={() => needSuggestion && applySuggestion(needSuggestion.id)}>
                    <span className="micro-label">Best need match from your board</span>
                    <ProspectPill prospect={needSuggestion} />
                  </button>
                </div>
              </div>

              <div className="detail-card on-clock-module">
                <div className="module-header">
                  <div>
                    <span className="label">On the clock</span>
                    <h2>{TEAMS[selectedPickData.currentTeam].name}</h2>
                  </div>
                  <span className={selectedPickData.status === "on_clock" ? "live-dot" : "slot-status"}>
                    {selectedPickData.status === "on_clock" ? "On clock" : "Upcoming"}
                  </span>
                </div>

                <div className="official-pick-shell">
                  <span className="micro-label">Official pick</span>
                  <div className="official-pick-placeholder">Hidden until announced</div>
                </div>

                <div className="needs-line">
                  <span className="micro-label">Team needs</span>
                  <div className="needs-pills">
                    {TEAMS[selectedPickData.currentTeam].needs.map((need) => (
                      <span className="pill-meta" key={need}>{need}</span>
                    ))}
                  </div>
                </div>

                <div className="pool-picks-shell">
                  <span className="micro-label">Pool status</span>
                  <PoolStatusGrid revealed={false} />
                </div>
              </div>
            </div>

            <div className="bottom-modules">
              <div className="detail-card">
                <div className="module-header">
                  <div>
                    <span className="label">Upcoming</span>
                    <h2>Next decisions</h2>
                  </div>
                  <span className="subtle">This is where the draft list and big board meet.</span>
                </div>
                <div className="pick-list">
                  {INITIAL_PICKS.slice(0, 6).map((pick) => {
                    const prediction = getProspect(predictions[pick.number]);
                    const manual = manualPicks[pick.number] ? getProspect(manualPicks[pick.number]) : null;
                    const status = buildPickStatus({
                      pick,
                      prediction: predictions[pick.number],
                      takenIds,
                      boardIds,
                      fallbackMode,
                      manualPickId: manualPicks[pick.number],
                    });

                    return (
                      <button key={pick.number} className={selectedPick === pick.number ? "pick-row active" : "pick-row"} onClick={() => setSelectedPick(pick.number)}>
                        <div className="pick-num">{pick.number}</div>
                        <div className="pick-main">
                          <div className="pick-topline">
                            <strong>{TEAMS[pick.currentTeam].name}</strong>
                            <span className="team-needs-inline">Needs {TEAMS[pick.currentTeam].needs.join(" · ")}</span>
                            {pick.trade ? <span className="trade-badge">Trade</span> : null}
                          </div>
                          <div className="pick-columns">
                            <div>
                              <span className="micro-label">Prediction</span>
                              <ProspectPill prospect={prediction} />
                            </div>
                            <div>
                              <span className="micro-label">Fallback right now</span>
                              <ProspectPill prospect={manual ?? status.effective} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="detail-card">
                <div className="module-header">
                  <div>
                    <span className="label">Competition</span>
                    <h2>Pool standings</h2>
                  </div>
                  <span className="subtle">Make the race visible without overpowering the current pick.</span>
                </div>
                <LeaderboardTable />
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="board-layout">
          <section className="panel research-panel">
            <div className="panel-header">
              <div>
                <span className="label">Player research</span>
                <h2>Board workspace</h2>
              </div>
              <span className="subtle">Sort and filter here, then tag players directly into the mock draft.</span>
            </div>

            <div className="filter-row">
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
                <option value="ALL">All positions</option>
                <option value="QB">QB</option>
                <option value="WR">WR</option>
                <option value="OT">OT</option>
                <option value="EDGE">EDGE</option>
                <option value="CB">CB</option>
                <option value="DT">DT</option>
                <option value="RB">RB</option>
                <option value="TE">TE</option>
                <option value="S">S</option>
              </select>
              <select value={boardSort} onChange={(event) => setBoardSort(event.target.value)}>
                <option value="my_board">My board</option>
                <option value="consensus">Consensus</option>
                <option value="espn">ESPN</option>
                <option value="pff">PFF</option>
              </select>
              <div className="assign-pill">Assigning into Pick {selectedPick}</div>
            </div>

            <div className="research-table">
              {visibleProspects.map((prospect) => {
                const assignedPick = Number(Object.keys(predictions).find((pickNum) => predictions[pickNum] === prospect.id));
                return (
                  <div className="research-row" key={prospect.id}>
                    <div className="rank-cell">#{boardIds.indexOf(prospect.id) + 1}</div>
                    <div className="research-main">
                      <div className="research-title">
                        <strong>{prospect.name}</strong>
                        <span className="pill-meta">{prospect.position}</span>
                        <span className="pill-meta">{prospect.school}</span>
                        {assignedPick ? <span className="trade-badge">Predicted at {assignedPick}</span> : null}
                      </div>
                      <p>{prospect.notes}</p>
                      <div className="rank-strip">
                        <span>Consensus {prospect.consensus}</span>
                        <span>ESPN {prospect.espn}</span>
                        <span>PFF {prospect.pff}</span>
                        <span>Dane {prospect.dane}</span>
                      </div>
                    </div>
                    <div className="research-actions">
                      <button className="small-button" onClick={() => moveBoardItem(prospect.id, "up")}>↑</button>
                      <button className="small-button" onClick={() => moveBoardItem(prospect.id, "down")}>↓</button>
                      <button className="primary-button" onClick={() => assignPlayerToPick(prospect.id, selectedPick)}>Assign to Pick {selectedPick}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MockTrackingGrid() {
  return (
    <div className="mock-grid">
      {MOCK_TRACKING_ROWS.map((row, index) => (
        <div className={index === 2 ? "mock-row current" : "mock-row"} key={row.pick}>
          <div className="mock-main-card">
            <div className="mock-row-head">
              <div>
                <span className="label">Pick {row.pick}</span>
                <h3>{TEAMS[row.team].name}</h3>
              </div>
              <span className={row.actual ? "result-badge announced" : "result-badge live"}>
                {row.actual ? "Announced" : "On clock"}
              </span>
            </div>

            <div className="mock-comparison-grid">
              <div className="mock-box actual-box">
                <span className="micro-label">Correct pick</span>
                <strong>{row.actual ?? "Hidden until announced"}</strong>
              </div>
              <div className={`mock-box my-pick-box ${row.me.state}`}>
                <span className="micro-label">My pick</span>
                <strong>{row.me.player}</strong>
                <span>{row.me.score ?? mockStateLabel(row.me.state)}</span>
              </div>
            </div>
          </div>

          <div className="mock-opponents-card">
            <span className="micro-label">Opponent picks</span>
            <div className="mock-opponent-grid">
              {row.opponents.map((opponent) => (
                <div className={`mock-opponent-pill ${opponent.state}`} key={`${row.pick}-${opponent.name}`}>
                  <strong>{opponent.name}</strong>
                  <span>{opponent.player}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function mockStateLabel(state) {
  if (state === "exact") return "Exact hit";
  if (state === "near") return "Within 2 picks";
  if (state === "alive") return "Still alive";
  if (state === "current") return "In play now";
  return "Missed";
}

function MockChallengeWireframe({ onBack }) {
  const [mockPhase, setMockPhase] = useState("entry");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [boardSort, setBoardSort] = useState("consensus");
  const [selectedPick, setSelectedPick] = useState(5);
  const [predictions] = useState(INITIAL_PREDICTIONS);

  const visibleProspects = useMemo(() => {
    const filtered = PROSPECTS.filter((prospect) => positionFilter === "ALL" || prospect.position.includes(positionFilter));
    const sorters = {
      consensus: (a, b) => a.consensus - b.consensus,
      espn: (a, b) => a.espn - b.espn,
      pff: (a, b) => a.pff - b.pff,
    };
    return [...filtered].sort(sorters[boardSort]);
  }, [positionFilter, boardSort]);

  return (
    <div className="screen-stack">
      <TopBar title="Mock Challenge" onBack={onBack} />

      <section className="workspace-nav">
        <div className="tab-set">
          <button className={mockPhase === "entry" ? "tab active" : "tab"} onClick={() => setMockPhase("entry")}>Pre-draft entry</button>
          <button className={mockPhase === "tracking" ? "tab active" : "tab"} onClick={() => setMockPhase("tracking")}>Tracking mode</button>
        </div>
        <div className="tab-actions">
          <span className="chip">Correct pick: 3</span>
          <span className="chip">1 pick away: 2</span>
          <span className="chip">2 picks away: 1</span>
        </div>
      </section>

      {mockPhase === "entry" ? (
        <div className="mock-entry-layout">
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Mock Challenge</span>
                <h2>Submit your Round 1 predictions</h2>
              </div>
              <span className="subtle">This should feel close to the live draft prep experience, but simpler and one-time.</span>
            </div>

            <div className="pick-list">
              {INITIAL_PICKS.map((pick) => (
                <button key={pick.number} className={selectedPick === pick.number ? "pick-row active" : "pick-row"} onClick={() => setSelectedPick(pick.number)}>
                  <div className="pick-num">{pick.number}</div>
                  <div className="pick-main">
                    <div className="pick-topline">
                      <strong>{TEAMS[pick.currentTeam].name}</strong>
                      <span className="team-needs-inline">Needs {TEAMS[pick.currentTeam].needs.join(" · ")}</span>
                    </div>
                    <div className="pick-columns">
                      <div>
                        <span className="micro-label">Your prediction</span>
                        <ProspectPill prospect={getProspect(predictions[pick.number])} />
                      </div>
                      <div>
                        <span className="micro-label">Scoring window</span>
                        <span className="subtle">3 pts exact · 2 pts within 1 · 1 pt within 2</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Board helper</span>
                <h2>Research and sort</h2>
              </div>
              <span className="subtle">Optional support tool, not a required second game system.</span>
            </div>

            <div className="filter-row">
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
                <option value="ALL">All positions</option>
                <option value="QB">QB</option>
                <option value="WR">WR</option>
                <option value="OT">OT</option>
                <option value="EDGE">EDGE</option>
                <option value="CB">CB</option>
                <option value="DT">DT</option>
              </select>
              <select value={boardSort} onChange={(event) => setBoardSort(event.target.value)}>
                <option value="consensus">Consensus</option>
                <option value="espn">ESPN</option>
                <option value="pff">PFF</option>
              </select>
            </div>

            <div className="research-table compact">
              {visibleProspects.slice(0, 8).map((prospect) => (
                <div className="research-row compact" key={prospect.id}>
                  <div className="rank-cell">#{prospect.consensus}</div>
                  <div className="research-main">
                    <div className="research-title">
                      <strong>{prospect.name}</strong>
                      <span className="pill-meta">{prospect.position}</span>
                    </div>
                    <div className="rank-strip">
                      <span>{prospect.school}</span>
                      <span>ESPN {prospect.espn}</span>
                      <span>PFF {prospect.pff}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : (
        <div className="mock-tracking-layout">
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Tracking mode</span>
                <h2>Rolling scoring grid</h2>
              </div>
              <span className="subtle">Current pick stays visually dominant, with the last two picks above it and future picks directly below.</span>
            </div>
            <MockTrackingGrid />
          </section>

          <aside className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Competition</span>
                <h2>Live standings</h2>
              </div>
              <span className="subtle">Standings stay visible while picks roll in.</span>
            </div>
            <div className="mock-standings-table">
              {MOCK_SCOREBOARD.map((player, index) => (
                <div className={index === 0 ? "mock-standings-row top" : "mock-standings-row"} key={player.name}>
                  <strong>{index + 1}. {player.name}</strong>
                  <span>{player.points} pts</span>
                  <span>{player.picksScored} scored</span>
                  <span className="projection-chip">{player.trend}</span>
                </div>
              ))}
            </div>
            <div className="detail-card inset-card">
              <span className="micro-label">Color system</span>
              <div className="legend-list">
                <div className="legend-row"><span className="legend-swatch exact" /> Exact hit</div>
                <div className="legend-row"><span className="legend-swatch near" /> Within two picks</div>
                <div className="legend-row"><span className="legend-swatch alive" /> Still in contention</div>
                <div className="legend-row"><span className="legend-swatch miss" /> Scoring window missed</div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("select");

  if (screen === "live") return <LiveDraftWireframe onBack={() => setScreen("select")} />;
  if (screen === "mock") return <MockChallengeWireframe onBack={() => setScreen("select")} />;
  return <SelectionScreen onSelect={setScreen} />;
}

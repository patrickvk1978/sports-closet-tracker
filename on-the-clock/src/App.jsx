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
  {
    id: "cam-ward",
    name: "Cam Ward",
    position: "QB",
    school: "Miami",
    age: 22,
    consensus: 1,
    espn: 1,
    pff: 2,
    dane: 1,
    notes: "Creative off-platform thrower with starter traits and top-of-board buzz.",
  },
  {
    id: "travis-hunter",
    name: "Travis Hunter",
    position: "CB/WR",
    school: "Colorado",
    age: 21,
    consensus: 2,
    espn: 2,
    pff: 1,
    dane: 2,
    notes: "True two-way star. Elite ball skills and instant spotlight value.",
  },
  {
    id: "abdul-carter",
    name: "Abdul Carter",
    position: "EDGE",
    school: "Penn State",
    age: 21,
    consensus: 3,
    espn: 3,
    pff: 4,
    dane: 3,
    notes: "Explosive pass-rusher who consistently shows up in top-three scenarios.",
  },
  {
    id: "tet-mcmillan",
    name: "Tetairoa McMillan",
    position: "WR",
    school: "Arizona",
    age: 21,
    consensus: 4,
    espn: 5,
    pff: 3,
    dane: 5,
    notes: "Boundary receiver with size, catch radius, and red-zone gravity.",
  },
  {
    id: "will-campbell",
    name: "Will Campbell",
    position: "OT",
    school: "LSU",
    age: 21,
    consensus: 5,
    espn: 4,
    pff: 6,
    dane: 4,
    notes: "High-floor tackle prospect and frequent fit for tackle-needy teams.",
  },
  {
    id: "mason-graham",
    name: "Mason Graham",
    position: "DT",
    school: "Michigan",
    age: 21,
    consensus: 6,
    espn: 7,
    pff: 5,
    dane: 6,
    notes: "Quick disruptive interior defender with day-one impact profile.",
  },
  {
    id: "ashton-jeanty",
    name: "Ashton Jeanty",
    position: "RB",
    school: "Boise State",
    age: 21,
    consensus: 7,
    espn: 6,
    pff: 7,
    dane: 8,
    notes: "Feature back talent who could crash the top ten in the right script.",
  },
  {
    id: "will-johnson",
    name: "Will Johnson",
    position: "CB",
    school: "Michigan",
    age: 22,
    consensus: 8,
    espn: 9,
    pff: 9,
    dane: 7,
    notes: "Long corner with clear CB1 upside and sticky coverage traits.",
  },
  {
    id: "mykel-williams",
    name: "Mykel Williams",
    position: "EDGE",
    school: "Georgia",
    age: 20,
    consensus: 9,
    espn: 10,
    pff: 10,
    dane: 9,
    notes: "Traits-heavy edge defender who fits several pressure-needy teams.",
  },
  {
    id: "jalen-milroe",
    name: "Jalen Milroe",
    position: "QB",
    school: "Alabama",
    age: 22,
    consensus: 10,
    espn: 12,
    pff: 14,
    dane: 11,
    notes: "High-variance quarterback with movement skills and upside appeal.",
  },
  {
    id: "malaki-starks",
    name: "Malaki Starks",
    position: "S",
    school: "Georgia",
    age: 21,
    consensus: 11,
    espn: 11,
    pff: 12,
    dane: 10,
    notes: "Versatile safety who brings range and coverage flexibility.",
  },
  {
    id: "colston-loveland",
    name: "Colston Loveland",
    position: "TE",
    school: "Michigan",
    age: 21,
    consensus: 12,
    espn: 13,
    pff: 11,
    dane: 12,
    notes: "Modern receiving tight end who changes the middle of the field.",
  },
  {
    id: "kelvin-banks",
    name: "Kelvin Banks Jr.",
    position: "OT",
    school: "Texas",
    age: 21,
    consensus: 13,
    espn: 14,
    pff: 8,
    dane: 13,
    notes: "Athletic tackle with some of the strongest board variance in the class.",
  },
  {
    id: "walter-nolen",
    name: "Walter Nolen",
    position: "DT",
    school: "Ole Miss",
    age: 21,
    consensus: 14,
    espn: 15,
    pff: 13,
    dane: 15,
    notes: "Penetrating interior lineman with splash-play upside.",
  },
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

const REVEALED_PICKS = {
  1: [
    { name: "Patrick", player: "Cam Ward", status: "locked" },
    { name: "Sarah", player: "Cam Ward", status: "locked" },
    { name: "Davin", player: "Travis Hunter", status: "locked" },
  ],
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

function getProspect(id) {
  return PROSPECTS.find((prospect) => prospect.id === id) ?? null;
}

function getAvailableProspects(takenIds) {
  return PROSPECTS.filter((prospect) => !takenIds.has(prospect.id));
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
  const fallbackProspect = resolveBoardFallback({
    boardIds,
    takenIds,
    teamCode: pick.currentTeam,
    fallbackMode,
  });

  if (manualProspect && !takenIds.has(manualProspect.id)) {
    return {
      effective: manualProspect,
      label: "Manual override",
      detail: "Live draft-night change will lock if the pick happens now.",
    };
  }

  if (predictionProspect && !takenIds.has(predictionProspect.id)) {
    return {
      effective: predictionProspect,
      label: pick.currentTeam !== pick.originalTeam ? "Prediction still valid after trade" : "Prediction valid",
      detail: "Your slot prediction remains available.",
    };
  }

  if (!fallbackProspect) {
    return {
      effective: null,
      label: "No available fallback",
      detail: "Board is exhausted or unresolved.",
    };
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
          {!revealed ? (
            <span>{entry.status === "locked" ? "Locked in" : "Waiting"}</span>
          ) : (
            <span>{entry.pick ?? "No pick"}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("draft");
  const [selectedPick, setSelectedPick] = useState(1);
  const [fallbackMode, setFallbackMode] = useState("queue_plus_team_need");
  const [boardIds, setBoardIds] = useState([...PROSPECTS].sort((a, b) => a.consensus - b.consensus).map((prospect) => prospect.id));
  const [predictions, setPredictions] = useState(INITIAL_PREDICTIONS);
  const [manualPicks, setManualPicks] = useState({});
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [boardSort, setBoardSort] = useState("my_board");

  const takenIds = useMemo(() => {
    const ids = new Set();
    INITIAL_PICKS.forEach((pick) => {
      if (pick.actual) ids.add(pick.actual);
    });
    return ids;
  }, []);

  const visibleProspects = useMemo(() => {
    const ordered = boardIds.map(getProspect).filter(Boolean);
    const filtered = ordered.filter((prospect) => (
      positionFilter === "ALL" || prospect.position.includes(positionFilter)
    ));

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
  const queueSuggestion = resolveBoardFallback({
    boardIds,
    takenIds,
    teamCode: selectedPickData.currentTeam,
    fallbackMode: "queue_only",
  });
  const needSuggestion = resolveBoardFallback({
    boardIds,
    takenIds,
    teamCode: selectedPickData.currentTeam,
    fallbackMode: "queue_plus_team_need",
  });

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
    <div className="app-shell">
      <div className="top-ribbon">ESPN-style wireframe direction · draft board, best available, team needs, and pool competition in one workspace</div>
      <header className="hero">
        <div>
          <div className="eyebrow">Sports Closet prototype</div>
          <h1>On the Clock</h1>
          <p className="hero-copy">
            A cleaner Round 1 draft tracker where the left side behaves like live draft coverage and the right side explains your pick, your fallback, and the pool race.
          </p>
        </div>
        <div className="hero-meta">
          <div className="hero-card">
            <span className="label">Pool</span>
            <strong>Friday Night Room</strong>
            <span className="subtle">12 players · Round 1 only · all pools share one live draft feed</span>
          </div>
          <div className="hero-card hot">
            <span className="label">On the clock</span>
            <strong>Pick 1 · Tennessee</strong>
            <span className="subtle">Cam Ward leads your board · manual override available if feed lags</span>
          </div>
        </div>
      </header>

      <section className="workspace-nav">
        <div className="tab-set">
          <button className={activeTab === "draft" ? "tab active" : "tab"} onClick={() => setActiveTab("draft")}>
            Draft
          </button>
          <button className={activeTab === "board" ? "tab active" : "tab"} onClick={() => setActiveTab("board")}>
            Board
          </button>
        </div>
        <div className="tab-actions">
          <span className="chip">Exact player: 5</span>
          <span className="chip">Position: 2</span>
          <div className="toggle-group">
            <button
              className={fallbackMode === "queue_only" ? "mini-toggle active" : "mini-toggle"}
              onClick={() => setFallbackMode("queue_only")}
            >
              Queue only
            </button>
            <button
              className={fallbackMode === "queue_plus_team_need" ? "mini-toggle active" : "mini-toggle"}
              onClick={() => setFallbackMode("queue_plus_team_need")}
            >
              Need match
            </button>
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
                      <button
                        key={pick.number}
                        className={selectedPick === pick.number ? "pick-row active" : "pick-row"}
                        onClick={() => setSelectedPick(pick.number)}
                      >
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
                      <button className="primary-button" onClick={() => assignPlayerToPick(prospect.id, selectedPick)}>
                        Assign to Pick {selectedPick}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="panel side-board-panel">
            <div className="panel-header">
              <div>
                <span className="label">Shared state</span>
                <h2>What changes in Draft</h2>
              </div>
              <span className="subtle">This panel explains the connection between research and live decisioning.</span>
            </div>

            <div className="detail-stack">
              <div className="detail-card">
                <span className="micro-label">Current pick target</span>
                <strong>Pick {selectedPick} · {TEAMS[selectedPickData.currentTeam].name}</strong>
                <p>Any player you assign here updates the mock draft immediately.</p>
              </div>

              <div className="detail-card">
                <span className="micro-label">Big board default</span>
                <p>
                  Every user starts with a global board. If they never show up on draft night, the system still has an ordered queue to use.
                </p>
              </div>

              <div className="detail-card">
                <span className="micro-label">Fallback mode</span>
                <p>
                  Right now the prototype is set to <strong>{fallbackMode === "queue_only" ? "Queue only" : "Need match"}</strong>.
                  That changes which player becomes the auto-pick if a slot prediction breaks.
                </p>
              </div>

              <div className="detail-card">
                <span className="micro-label">Useful partner talking points</span>
                <div className="mini-list">
                  <div className="mini-row"><strong>Prep matters</strong><span>Your board powers all fallback logic.</span></div>
                  <div className="mini-row"><strong>Mock stays fun</strong><span>Predictions remain a separate artifact from the board.</span></div>
                  <div className="mini-row"><strong>Trades are survivable</strong><span>The slot stays fixed and the app recomputes suggestions.</span></div>
                </div>
              </div>

              <div className="detail-card">
                <span className="micro-label">Pool standings preview</span>
                <LeaderboardTable />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default App;

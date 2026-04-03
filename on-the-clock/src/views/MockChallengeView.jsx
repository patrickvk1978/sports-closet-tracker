import { useMemo, useState } from "react";
import BigBoardTable from "../components/BigBoardTable";
import { usePool } from "../hooks/usePool";
import { DEFAULT_ACTUAL_PICKS, ROUND_ONE_PICKS, TEAMS, getPickLabel, getProspectById } from "../lib/draftData";

function stateLabel(state) {
  if (state === "exact") return "Exact hit (+3)";
  if (state === "one-away") return "1 away (+2)";
  if (state === "two-away") return "2 away (+1)";
  if (state === "in-play") return "In play";
  return "Out of range";
}

export default function MockChallengeView() {
  const {
    pool,
    members,
    memberList,
    draftFeed,
    bigBoardIds,
    mockPredictions,
    hasSubmittedMock,
    mockStandings,
    mockTrackingRows,
    moveBigBoardItem,
    saveMockPrediction,
    submitMockPredictions,
    resetMockPredictions,
    startDraftNight,
    setPickStatus,
    revealCurrentPick,
    advanceDraft,
    resetDraftFeed,
  } = usePool();
  const [selectedPick, setSelectedPick] = useState(1);
  const [devMode, setDevMode] = useState("entry");

  function teamCodeForPick(pick) {
    return draftFeed.team_overrides?.[pick.number] ?? pick.currentTeam;
  }

  const draftedIds = useMemo(() => new Set(Object.values(draftFeed.actual_picks ?? {})), [draftFeed.actual_picks]);
  const trackingMode = (hasSubmittedMock && draftFeed.phase === "live") || devMode === "tracking";
  const currentPickNumber = draftFeed.current_pick_number;
  const opponentMembers = memberList.filter((member) => !member.isCurrentUser);

  const mappedPickByProspectId = Object.entries(mockPredictions).reduce((accumulator, [pickNumber, prospectId]) => {
    if (prospectId) accumulator[prospectId] = getPickLabel(Number(pickNumber));
    return accumulator;
  }, {});

  const completedPickCount = Object.keys(mockPredictions).filter((pickNumber) => mockPredictions[pickNumber]).length;
  const remainingCount = ROUND_ONE_PICKS.length - completedPickCount;
  const currentIndex = Math.max(0, mockTrackingRows.findIndex((row) => row.pick.number === currentPickNumber));
  const visibleRows = mockTrackingRows.slice(Math.max(0, currentIndex - 2), Math.min(mockTrackingRows.length, currentIndex + 3));

  return (
    <>
      <div className="workspace-nav">
        <div className="tab-set">
          <button className={!trackingMode ? "tab active" : "tab"} onClick={() => setDevMode("entry")}>Pre-draft entry</button>
          <button className={trackingMode ? "tab active" : "tab"} onClick={() => setDevMode("tracking")}>Tracking mode</button>
        </div>
        <div className="tab-actions">
          <span className="chip">{pool?.name ?? "Mock Pool"}</span>
          <span className="chip">Mock Challenge</span>
        </div>
      </div>

      {!trackingMode ? (
        <div className="mock-entry-layout">
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Mock Challenge</span>
                <h2>Submit Predictions</h2>
              </div>
              <span className="subtle">{remainingCount} picks remaining · Entries lock in 2h 14m</span>
            </div>

            <div className="pick-list">
              {ROUND_ONE_PICKS.map((pick) => (
                <button
                  key={pick.number}
                  className={selectedPick === pick.number ? "pick-row active" : "pick-row"}
                  onClick={() => setSelectedPick(pick.number)}
                >
                  <div className="pick-num">{pick.number}</div>
                  <div className="pick-main">
                    <div className="pick-topline">
                      <strong>{TEAMS[teamCodeForPick(pick)].name}</strong>
                    </div>
                    <div className="pick-columns single-column">
                      <div>
                        <span className="micro-label">Your prediction</span>
                        <span className="subtle">{getProspectById(mockPredictions[pick.number])?.name ?? "Select a player"}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="entry-actions">
              <button className="primary-button" type="button" disabled={remainingCount > 0} onClick={submitMockPredictions}>
                Submit Predictions
              </button>
              <button className="secondary-button" type="button" onClick={() => { submitMockPredictions(); startDraftNight(); setDevMode("tracking"); }}>
                Submit and Enter Tracking
              </button>
            </div>

            <div className="detail-card inset-card">
              <span className="micro-label">Pool</span>
              <p>{members.length} entrants in this pool. The app will switch into tracking mode automatically once entries lock and the draft starts.</p>
            </div>
          </section>

          <BigBoardTable
            title="Big Board"
            subtitle="Research and map players to team slots"
            boardIds={bigBoardIds}
            onMove={moveBigBoardItem}
            draftedIds={draftedIds}
            mappedPickByProspectId={mappedPickByProspectId}
            selectedPickLabel={getPickLabel(selectedPick)}
            assignLabel={`Use for ${getPickLabel(selectedPick)}`}
            onAssignSelectedProspect={(prospectId) => saveMockPrediction(selectedPick, prospectId)}
          />
        </div>
      ) : (
        <div className="mock-tracking-layout">
          <section className="panel">
            <div className="module-header">
              <div>
                <span className="label">Current Pick</span>
                <h2>{getPickLabel(currentPickNumber)} — {draftFeed.current_status === "revealed" ? "Revealed" : "On the Clock"}</h2>
              </div>
            </div>

            <div className="dev-control-row">
              <button className="secondary-button" type="button" onClick={startDraftNight}>Start tracking</button>
              <button className="secondary-button" type="button" onClick={() => setPickStatus("pick_is_in")}>Pick is in</button>
              <button className="secondary-button" type="button" onClick={() => revealCurrentPick(DEFAULT_ACTUAL_PICKS[currentPickNumber])}>Reveal pick</button>
              <button className="secondary-button" type="button" onClick={advanceDraft}>Next pick</button>
              <button className="secondary-button" type="button" onClick={() => { resetDraftFeed(); resetMockPredictions(); setDevMode("entry"); }}>Reset</button>
            </div>

            <div className="mock-grid-shell">
              <div className="mock-grid-header">
                <div className="mock-fixed-header"><span>Pick</span><span>Actual</span><span>You</span></div>
                <div className="mock-scroll-header">
                  {opponentMembers.map((member) => <span key={member.id}>{member.name}</span>)}
                </div>
              </div>
              <div className="mock-grid">
                {visibleRows.map((row) => (
                  <div key={row.pick.number} className={row.pick.number === currentPickNumber ? "mock-grid-row current" : "mock-grid-row"}>
                    <div className="mock-fixed-columns">
                      <div className="mock-cell pick-cell">
                        <strong>{row.pick.number}</strong>
                        <span>{TEAMS[teamCodeForPick(row.pick)].name}</span>
                      </div>
                      <div className="mock-cell actual-cell">
                        <span className="micro-label">Actual</span>
                        <strong>{row.actualProspect?.name ?? "Waiting"}</strong>
                      </div>
                      <div className={`mock-cell my-pick-cell ${row.myState}`}>
                        <span className="micro-label">My Pick</span>
                        <strong>{row.myProspect?.name ?? "Open"}</strong>
                        <span>{stateLabel(row.myState)}</span>
                      </div>
                    </div>
                    <div className="mock-scroll-columns" style={{ gridTemplateColumns: `repeat(${Math.max(opponentMembers.length, 1)}, minmax(160px, 1fr))` }}>
                      {row.opponents.map((opponent) => (
                        <div key={`${row.pick.number}-${opponent.id}`} className={`mock-opponent-cell ${opponent.state}`}>
                          <strong>{opponent.prospect?.name ?? "Open"}</strong>
                          <span>{opponent.name} · {stateLabel(opponent.state)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Standings</span>
                <h2>Live scoring</h2>
              </div>
            </div>
            <div className="mock-standings-table">
              <div className="mock-standings-head"><span>Player</span><span>Pts</span></div>
              {mockStandings.map((player, index) => (
                <div key={player.name} className={index === 0 ? "mock-standings-row top" : "mock-standings-row"}>
                  <strong>{index + 1}. {player.name}</strong>
                  <span>{player.points}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

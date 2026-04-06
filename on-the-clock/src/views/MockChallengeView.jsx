import { useEffect, useMemo, useRef, useState } from "react";
import BigBoardTable from "../components/BigBoardTable";
import { SkeletonPanel } from "../components/Skeleton";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { useCountdown } from "../hooks/useCountdown";
import { useDraftFeed } from "../hooks/useDraftFeed";
import { useBigBoard } from "../hooks/useBigBoard";
import { useMockChallenge } from "../hooks/useMockChallenge";
import { useReferenceData } from "../hooks/useReferenceData";

function stateLabel(state) {
  if (state === "exact") return "Exact hit (+3)";
  if (state === "one-away") return "1 away (+2)";
  if (state === "two-away") return "2 away (+1)";
  if (state === "in-play") return "In play";
  return "Out of range";
}

export default function MockChallengeView() {
  const { profile } = useAuth();
  const isAdmin = Boolean(profile?.is_admin);
  const { pool, members, memberList } = usePool();
  const { draftFeed } = useDraftFeed();
  const { bigBoardIds, moveBigBoardItem } = useBigBoard();
  const { picks, teams, getPickLabel, getProspectById, loading: refLoading } = useReferenceData();
  const {
    mockPredictions,
    hasSubmittedMock,
    mockStandings,
    mockTrackingRows,
    submittedCount,
    saveMockPrediction,
    submitMockPredictions,
  } = useMockChallenge({ draftFeed });
  const countdown = useCountdown();
  const [selectedPick, setSelectedPick] = useState(1);
  const [devMode, setDevMode] = useState("entry");

  function teamCodeForPick(pick) {
    return draftFeed.team_overrides?.[pick.number] ?? pick.currentTeam;
  }

  const draftedIds = useMemo(() => new Set(Object.values(draftFeed.actual_picks ?? {})), [draftFeed.actual_picks]);
  const trackingMode = isAdmin && ((hasSubmittedMock && draftFeed.phase === "live") || devMode === "tracking");
  const currentPickNumber = draftFeed.current_pick_number;
  const opponentMembers = memberList.filter((member) => !member.isCurrentUser);

  const mappedPickByProspectId = Object.entries(mockPredictions).reduce((accumulator, [pickNumber, prospectId]) => {
    if (prospectId) accumulator[prospectId] = getPickLabel(Number(pickNumber));
    return accumulator;
  }, {});

  const completedPickCount = Object.keys(mockPredictions).filter((pickNumber) => mockPredictions[pickNumber]).length;
  const remainingCount = picks.length - completedPickCount;
  const visibleRows = mockTrackingRows;
  const currentRowRef = useRef(null);
  useEffect(() => {
    if (trackingMode && currentRowRef.current) {
      currentRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [trackingMode, currentPickNumber]);
  const selectedPrediction = getProspectById(mockPredictions[selectedPick]);
  const currentTrackingRow = mockTrackingRows.find((row) => row.pick.number === currentPickNumber);
  const inPlayRangeStart = Math.max(1, currentPickNumber - 2);
  const inPlayRangeEnd = Math.min(picks.length, currentPickNumber + 2);

  if (refLoading) {
    return (
      <div className="mode-prep-layout" style={{ marginTop: 16 }}>
        <SkeletonPanel rows={6} />
        <SkeletonPanel rows={8} />
      </div>
    );
  }

  return (
    <>
      <div className="workspace-nav">
        <div className="tab-set">
          <button className={!trackingMode ? "tab active" : "tab"} type="button" onClick={() => setDevMode("entry")}>Pre-draft entry</button>
          {isAdmin ? (
            <button className={trackingMode ? "tab active" : "tab"} type="button" onClick={() => setDevMode("tracking")}>Tracking mode</button>
          ) : null}
        </div>
        <div className="tab-actions">
          {trackingMode ? (
            <span className="chip">{`Current window ${inPlayRangeStart}-${inPlayRangeEnd}`}</span>
          ) : (
            <div className={`countdown-clock ${countdown.expired ? "live" : ""}`}>
              <span className="countdown-label">{countdown.expired ? "ENTRIES LOCKED" : "Entries lock in"}</span>
              {!countdown.expired ? <span className="countdown-time">{countdown.label}</span> : null}
            </div>
          )}
        </div>
      </div>

      {!trackingMode ? (
        <div className="mode-prep-layout">
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Mock Challenge</span>
                <h2>Submit Predictions</h2>
              </div>
              <span className="subtle">{remainingCount} picks remaining</span>
            </div>

            <div className="flow-helper-card">
              <div className="flow-step">
                <span className="micro-label">Step 1</span>
                <strong>Select a team slot</strong>
                <span>Pick the team slot you want to fill from the list below.</span>
              </div>
              <div className="flow-step">
                <span className="micro-label">Step 2</span>
                <strong>Choose from your Big Board</strong>
                <span>The Big Board is your research and ranking engine for filling each prediction.</span>
              </div>
              <div className="flow-step">
                <span className="micro-label">Step 3</span>
                <strong>Submit once</strong>
                <span>You can edit until lock. After that, the page switches into tracking mode automatically.</span>
              </div>
            </div>

            <div className="pick-list">
              {picks.map((pick) => {
                const prediction = getProspectById(mockPredictions[pick.number]);
                const isEmpty = !prediction;
                const teamName = teams[teamCodeForPick(pick)]?.name;
                const classes = ["pick-row"];
                if (selectedPick === pick.number) classes.push("active");
                if (isEmpty) classes.push("empty");
                return (
                  <button
                    key={pick.number}
                    className={classes.join(" ")}
                    data-pick-watermark={pick.number}
                    onClick={() => setSelectedPick(pick.number)}
                  >
                    <div className="pick-num">{pick.number}</div>
                    <div className="pick-main">
                      {prediction ? (
                        <>
                          <strong className="pick-player-name">{prediction.name}</strong>
                          <span className="pick-player-meta">
                            {prediction.position} · {prediction.school}
                            <span className="pick-to-team"> → {teamName}</span>
                          </span>
                        </>
                      ) : (
                        <span className="pick-empty-team">{teamName}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="future-pick-helper">
              <div>
                <span className="micro-label">Editing slot</span>
                <strong>{getPickLabel(selectedPick)}</strong>
              </div>
              <div>
                <span className="micro-label">Current prediction</span>
                <span className="subtle">{selectedPrediction?.name ?? "Choose a player from the Big Board"}</span>
              </div>
              <button className="primary-button" type="button" disabled={remainingCount > 0} onClick={submitMockPredictions}>
                Submit Predictions
              </button>
            </div>

            {isAdmin ? (
              <div className="entry-actions">
                <button className="secondary-button" type="button" onClick={() => setDevMode("tracking")}>
                  Preview Tracking Mode
                </button>
              </div>
            ) : null}

            <div className="detail-card inset-card">
              <span className="micro-label">Pool participation</span>
              <p><strong>{submittedCount} of {members.length}</strong> entrants have submitted. {hasSubmittedMock ? "You're in — predictions remain editable until lock." : "Your entry is still editable until the global lock time."}</p>
            </div>
          </section>

          <BigBoardTable
            title="Big Board"
            subtitle="Your ranking engine — assign players to each team slot"
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
            <div className="tracking-hero">
              <div className="tracking-current-card">
                <span className="label">Current Pick</span>
                <h2>{getPickLabel(currentPickNumber)}</h2>
                <div className="tracking-current-detail">
                  <div>
                    <span className="micro-label">Actual</span>
                    <strong>{currentTrackingRow?.actualProspect?.name ?? "Waiting to be revealed"}</strong>
                  </div>
                  <div>
                    <span className="micro-label">Your pick</span>
                    <strong>{currentTrackingRow?.myProspect?.name ?? "Open"}</strong>
                  </div>
                </div>
              </div>
              <div className="tracking-window-card">
                <span className="micro-label">Scoring window</span>
                <strong>{`Picks ${inPlayRangeStart}-${inPlayRangeEnd}`}</strong>
                <span>{currentTrackingRow?.myState === "in-play" ? "Your current pick is still in play." : stateLabel(currentTrackingRow?.myState ?? "out-of-range")}</span>
              </div>
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
                  <div
                    key={row.pick.number}
                    ref={row.pick.number === currentPickNumber ? currentRowRef : null}
                    className={row.pick.number === currentPickNumber ? "mock-grid-row current" : "mock-grid-row"}
                  >
                    <div className="mock-fixed-columns">
                      <div className="mock-cell pick-cell">
                        <strong>{row.pick.number}</strong>
                        <span>{teams[teamCodeForPick(row.pick)]?.name}</span>
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
            <div className="detail-card inset-card">
              <span className="micro-label">Scoring</span>
              <p>Exact hit = 3, 1 away = 2, 2 away = 1. Yellow means the pick is still alive inside the current scoring window.</p>
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

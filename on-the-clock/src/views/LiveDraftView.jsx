import { useMemo, useState } from "react";
import BigBoardTable from "../components/BigBoardTable";
import { SkeletonPickList, SkeletonPanel } from "../components/Skeleton";
import { usePool } from "../hooks/usePool";
import { useDraftFeed } from "../hooks/useDraftFeed";
import { useBigBoard } from "../hooks/useBigBoard";
import { useLiveDraft } from "../hooks/useLiveDraft";
import { useReferenceData } from "../hooks/useReferenceData";

function ProspectPill({ prospect }) {
  if (!prospect) return <span className="pill neutral">Open slot</span>;
  return (
    <span className="prospect-pill">
      <span>{prospect.name}</span>
      <span className="pill-meta">{prospect.position}</span>
    </span>
  );
}

function statusCopy(status) {
  if (status === "on_clock") return "On the Clock";
  if (status === "pick_is_in") return "Pick is in";
  return "Revealed";
}

function countdownCopy(status) {
  if (status === "on_clock") return "04:18";
  if (status === "pick_is_in") return "00:24";
  return "SCORED";
}

export default function LiveDraftView() {
  const { pool, members } = usePool();
  const { draftFeed, teamCodeForPick } = useDraftFeed();
  const { bigBoardIds, moveBigBoardItem } = useBigBoard();
  const { picks, teams, getPickLabel, getProspectById, loading: refLoading } = useReferenceData();
  const {
    livePredictions,
    liveSelections,
    liveCards,
    liveStandings,
    currentLivePoolState,
    saveLivePrediction,
    setLiveCurrentSelection,
    submitLiveCard,
  } = useLiveDraft({ draftFeed, teamCodeForPick });
  const [selectedPick, setSelectedPick] = useState(1);

  function teamForPick(pick) {
    return draftFeed.team_overrides?.[pick.number] ?? pick.currentTeam;
  }

  const draftedIds = useMemo(() => new Set(Object.values(draftFeed.actual_picks ?? {})), [draftFeed.actual_picks]);
  const currentPickNumber = draftFeed.current_pick_number;
  const currentPick = picks.find((pick) => pick.number === currentPickNumber) ?? picks[0] ?? { number: 1, currentTeam: "" };
  const selectedPickData = picks.find((pick) => pick.number === selectedPick) ?? currentPick;
  const currentTeam = teams[teamForPick(currentPick)] ?? {};
  const currentSelectionId =
    liveSelections[currentPickNumber] ??
    liveCards[currentPickNumber] ??
    livePredictions[currentPickNumber] ??
    null;
  const currentSelection = getProspectById(currentSelectionId);
  const actualCurrentPick = getProspectById(draftFeed.actual_picks?.[currentPickNumber]);

  const mappedPickByProspectId = Object.entries(livePredictions).reduce((accumulator, [pickNumber, prospectId]) => {
    if (prospectId) accumulator[prospectId] = getPickLabel(Number(pickNumber));
    return accumulator;
  }, {});

  const isPreDraft = draftFeed.phase === "pre_draft";
  const currentLocked = Boolean(liveCards[currentPickNumber]);
  const selectedFuturePrediction = getProspectById(livePredictions[selectedPickData.number]);
  const preRevealPoolState = currentLivePoolState.map((member) => ({
    ...member,
    className: member.locked ? "locked" : "waiting",
    status: member.locked ? "Submitted" : "Choosing",
  }));

  if (refLoading) {
    return (
      <>
        <div className="workspace-nav live-nav" style={{ marginBottom: 16 }}>
          <div className="tab-set">
            <button className="tab active" type="button">Pre-draft</button>
            <button className="tab" type="button">Live Draft</button>
          </div>
        </div>
        <div className="mode-prep-layout">
          <SkeletonPanel rows={5} />
          <SkeletonPanel rows={8} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="workspace-nav live-nav">
        <div className="tab-set">
          <button className={isPreDraft ? "tab active" : "tab"} type="button">Pre-draft</button>
          <button className={!isPreDraft ? "tab active" : "tab"} type="button">Live Draft</button>
        </div>
        <div className="tab-actions">
          <span className="chip">{pool?.name ?? "Draft Pool"}</span>
          <span className="chip">Live Draft</span>
          <span className="chip countdown-chip">{isPreDraft ? "Draft starts Thu 7:00 PM" : `Clock ${countdownCopy(draftFeed.current_status)}`}</span>
        </div>
      </div>

      {isPreDraft ? (
        <div className="mode-prep-layout">
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Pre-draft</span>
                <h2>Set up your team-based picks</h2>
              </div>
              <span className="subtle">When the commissioner starts the draft, this page becomes your live command center.</span>
            </div>

            <div className="flow-helper-card">
              <div className="flow-step">
                <span className="micro-label">Step 1</span>
                <strong>Select a team slot</strong>
                <span>Use the left column to choose the pick you want to set up.</span>
              </div>
              <div className="flow-step">
                <span className="micro-label">Step 2</span>
                <strong>Use Big Board to pick a player</strong>
                <span>The Big Board on the right powers your setup now and your fallback logic later.</span>
              </div>
              <div className="flow-step">
                <span className="micro-label">Step 3</span>
                <strong>Come back on draft night</strong>
                <span>You can still auto-submit from your board if you step away.</span>
              </div>
            </div>

            <div className="pick-list">
              {picks.map((pick) => {
                const prediction = getProspectById(livePredictions[pick.number]);
                return (
                  <button
                    key={pick.number}
                    className={selectedPick === pick.number ? "pick-row active" : "pick-row"}
                    onClick={() => setSelectedPick(pick.number)}
                  >
                    <div className="pick-num">{pick.number}</div>
                    <div className="pick-main">
                      <div className="pick-topline">
                        <strong>{teams[teamForPick(pick)]?.name}</strong>
                        <span className="team-needs-inline">Needs {teams[teamForPick(pick)]?.needs?.join(" · ")}</span>
                      </div>
                      <div className="pick-columns single-column">
                        <div>
                          <span className="micro-label">Current prediction</span>
                          <ProspectPill prospect={prediction} />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="detail-card inset-card">
              <span className="micro-label">Pool</span>
              <p>{members.length} members ready for a live draft format. Draft-night picks can still auto-submit from your Big Board if you step away.</p>
            </div>
          </section>

          <BigBoardTable
            title="Big Board"
            subtitle="Research, sort, and map players to teams"
            boardIds={bigBoardIds}
            onMove={moveBigBoardItem}
            draftedIds={draftedIds}
            mappedPickByProspectId={mappedPickByProspectId}
            selectedPickLabel={getPickLabel(selectedPickData.number)}
            assignLabel={`Use for ${getPickLabel(selectedPickData.number)}`}
            onAssignSelectedProspect={(prospectId) => saveLivePrediction(selectedPickData.number, prospectId)}
          />
        </div>
      ) : (
        <>
          <section className="panel live-hero-panel">
            <div className="live-hero-head">
              <div className={`live-state-banner ${draftFeed.current_status}`}>
                <span className="label">Current Pick</span>
                <strong>{`${currentTeam.name} (${currentPickNumber}) — ${statusCopy(draftFeed.current_status)}`}</strong>
                <span>{draftFeed.current_status === "revealed" ? "Pool picks and scoring are now visible." : "Other players stay hidden until the reveal flips."}</span>
              </div>
              <div className={`countdown-card ${draftFeed.current_status}`}>
                <span className="micro-label">{draftFeed.current_status === "revealed" ? "Result" : "Global Clock"}</span>
                <strong>{countdownCopy(draftFeed.current_status)}</strong>
                <span>{draftFeed.current_status === "on_clock" ? "Time left to submit the card" : draftFeed.current_status === "pick_is_in" ? "Waiting for the reveal" : "Pick resolved"}</span>
              </div>
            </div>
            <div className="hero-modules">
              <div className="detail-card spotlight your-pick-module">
                <div className="module-header">
                  <div>
                    <span className="label">Your Pick</span>
                    <h2>{currentTeam.name} ({currentPickNumber})</h2>
                  </div>
                  <span className="status-badge">
                    {statusCopy(draftFeed.current_status)}
                  </span>
                </div>
                <div className="your-pick-primary">
                  <div>
                    <span className="micro-label">{currentLocked ? "Submitted card" : "Current selection"}</span>
                    <ProspectPill prospect={currentSelection} />
                  </div>
                  <p>Leave it blank and the app auto-submits from your Big Board when the clock expires. If you choose a player but do not submit, that visible pick still locks on timeout.</p>
                </div>
                <div className="your-pick-suggestions">
                  <button className="suggestion-card" onClick={() => setLiveCurrentSelection(currentPickNumber, livePredictions[currentPickNumber])}>
                    <span className="micro-label">Use your setup pick</span>
                    <ProspectPill prospect={getProspectById(livePredictions[currentPickNumber])} />
                  </button>
                  <button className="primary-button" type="button" onClick={() => submitLiveCard(currentPickNumber)}>
                    Submit the Card
                  </button>
                </div>
              </div>

              <div className="detail-card on-clock-module">
                <div className="module-header">
                  <div>
                    <span className="label">Reveal</span>
                    <h2>{draftFeed.current_status === "revealed" ? "Card flipped" : "Waiting on the room"}</h2>
                  </div>
                  <span className="slot-status">{draftFeed.current_status === "revealed" ? "Scored" : "Awaiting reveal"}</span>
                </div>
                <div className={`official-pick-shell ${draftFeed.current_status}`}>
                  <span className="micro-label">Official pick</span>
                  {actualCurrentPick ? <ProspectPill prospect={actualCurrentPick} /> : <div className="official-pick-placeholder">Greyed out until the card flips</div>}
                </div>
                <div className="pool-picks-shell">
                  <span className="micro-label">{draftFeed.current_status === "revealed" ? "Pool results" : "Pool lock state"}</span>
                  <div className="pool-status-grid">
                    {(draftFeed.current_status === "revealed" ? currentLivePoolState : preRevealPoolState).map((member) => (
                      <div
                        key={member.id ?? member.name}
                        className={`pool-member-card ${
                          draftFeed.current_status === "revealed" ? `revealed ${member.result}` : member.className
                        }`}
                      >
                        <strong>{member.name}</strong>
                        <span>
                          {draftFeed.current_status === "revealed"
                            ? `${member.prospect?.name ?? "Open"} · ${member.result === "exact" ? "Exact hit" : member.result === "position" ? "Position hit" : "Miss"}`
                            : member.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="bottom-modules">
            <div className="detail-card">
              <div className="module-header">
                <div>
                  <span className="label">Round 1 Flow</span>
                  <h2>Current pick into upcoming setup</h2>
                </div>
              </div>
              <div className="future-pick-helper">
                <div>
                  <span className="micro-label">Editing slot</span>
                  <strong>{getPickLabel(selectedPickData.number)}</strong>
                </div>
                <div>
                  <span className="micro-label">Current prediction</span>
                  <ProspectPill prospect={selectedFuturePrediction} />
                </div>
                <button className="secondary-button" type="button" onClick={() => setLiveCurrentSelection(currentPickNumber, livePredictions[selectedPickData.number])}>
                  Copy to Current Pick
                </button>
              </div>
              <div className="pick-list">
                {picks.map((pick) => {
                  const prediction = getProspectById(livePredictions[pick.number]);
                  const lockedCard = getProspectById(liveCards[pick.number]);
                  const actualPick = getProspectById(draftFeed.actual_picks?.[pick.number]);

                  return (
                    <button
                      key={pick.number}
                      className={selectedPick === pick.number ? "pick-row active" : "pick-row"}
                      onClick={() => setSelectedPick(pick.number)}
                    >
                      <div className="pick-num">{pick.number}</div>
                      <div className="pick-main">
                        <div className="pick-topline">
                          <strong>{teams[teamForPick(pick)]?.name}</strong>
                          <span className="team-needs-inline">Needs {teams[teamForPick(pick)]?.needs?.join(" · ")}</span>
                        </div>
                        <div className="pick-columns">
                          <div>
                            <span className="micro-label">Prediction</span>
                            <ProspectPill prospect={prediction} />
                          </div>
                          <div>
                            <span className="micro-label">Submitted</span>
                            <ProspectPill prospect={lockedCard ?? prediction} />
                          </div>
                          {actualPick ? (
                            <div>
                              <span className="micro-label">Actual</span>
                              <ProspectPill prospect={actualPick} />
                            </div>
                          ) : null}
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
                  <span className="label">Standings</span>
                  <h2>Competition</h2>
                </div>
              </div>
              <div className="leaderboard-table">
                <div className="leaderboard-head"><span>Pool</span><span>Exact</span><span>Pos</span><span>Pts</span></div>
                {liveStandings.map((player, index) => (
                  <div key={player.name} className={index === 0 ? "leaderboard-row top" : "leaderboard-row"}>
                    <span className="leaderboard-player"><strong>{index + 1}</strong><span>{player.name}</span></span>
                    <span>{player.exact}</span>
                    <span>{player.position}</span>
                    <span className="points-strong">{player.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <BigBoardTable
            title="Big Board"
            subtitle="The ranking engine behind your setup picks and auto-submit behavior"
            boardIds={bigBoardIds}
            onMove={moveBigBoardItem}
            draftedIds={draftedIds}
            mappedPickByProspectId={mappedPickByProspectId}
            selectedPickLabel={getPickLabel(selectedPickData.number)}
            assignLabel={`Use for ${getPickLabel(selectedPickData.number)}`}
            onAssignSelectedProspect={(prospectId) =>
              selectedPickData.number === currentPickNumber
                ? setLiveCurrentSelection(currentPickNumber, prospectId)
                : saveLivePrediction(selectedPickData.number, prospectId)
            }
          />
        </>
      )}
    </>
  );
}

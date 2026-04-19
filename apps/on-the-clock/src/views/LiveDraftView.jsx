import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BigBoardTable from "../components/BigBoardTable";
import LiveStage from "../components/LiveStage";
import { SkeletonPickList, SkeletonPanel } from "../components/Skeleton";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { useCountdown } from "../hooks/useCountdown";
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
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = Boolean(profile?.is_admin);
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
  const countdown = useCountdown();
  const [selectedPick, setSelectedPick] = useState(1);
  const [liveTab, setLiveTab] = useState("draft");
  const [devPhase, setDevPhase] = useState(null); // admin override
  const [showInstructions, setShowInstructions] = useState(
    () => localStorage.getItem("otc_live_instructions_dismissed") !== "true"
  );

  // When the live draft advances to a new current pick, reset the left-column
  // focus (the selected pick slot) to the new on-the-clock pick. This is the
  // automatic reveal → left-column handoff.
  useEffect(() => {
    if (draftFeed.phase === "live" && draftFeed.current_pick_number) {
      setSelectedPick(draftFeed.current_pick_number);
      // Also clear any stale in-progress selection for the old pick — the
      // stage should enter the "empty" state for the new pick until the user
      // chooses a player.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFeed.current_pick_number, draftFeed.phase]);

  function dismissInstructions() {
    localStorage.setItem("otc_live_instructions_dismissed", "true");
    setShowInstructions(false);
  }

  function teamForPick(pick) {
    return draftFeed.team_overrides?.[pick.number] ?? pick.currentTeam;
  }

  const currentPickNumber = draftFeed.current_pick_number;
  const draftedIds = useMemo(() => {
    const blocked = new Set(Object.values(draftFeed.actual_picks ?? {}));
    // Also block players already submitted in past picks — can't reuse a card
    Object.entries(liveCards).forEach(([pickNum, prospectId]) => {
      if (Number(pickNum) < currentPickNumber) blocked.add(prospectId);
    });
    return blocked;
  }, [draftFeed.actual_picks, liveCards, currentPickNumber]);
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

  const effectivePhase = isAdmin && devPhase ? devPhase : draftFeed.phase;
  const isPreDraft = effectivePhase === "pre_draft" || !isAdmin;
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
          {isAdmin ? (
            <>
              <button className={isPreDraft ? "tab active" : "tab"} type="button" onClick={() => { setDevPhase("pre_draft"); setLiveTab("draft"); }}>Pre-draft</button>
              <button className={!isPreDraft && liveTab === "draft" ? "tab active" : "tab"} type="button" onClick={() => { setDevPhase("live"); setLiveTab("draft"); }}>Live Draft</button>
              {!isPreDraft ? (
                <button className={liveTab === "board" ? "tab active" : "tab"} type="button" onClick={() => setLiveTab("board")}>Big Board</button>
              ) : null}
            </>
          ) : !isPreDraft ? (
            <>
              <button className={liveTab === "draft" ? "tab active" : "tab"} type="button" onClick={() => setLiveTab("draft")}>Draft</button>
              <button className={liveTab === "board" ? "tab active" : "tab"} type="button" onClick={() => setLiveTab("board")}>Big Board</button>
            </>
          ) : null}
        </div>
        <div className="tab-actions">
          <div className={`countdown-clock ${countdown.expired ? "live" : ""}`}>
            <span className="countdown-label">{countdown.expired ? "DRAFT IS LIVE" : "Draft starts in"}</span>
            {!countdown.expired ? <span className="countdown-time">{countdown.label}</span> : null}
          </div>
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

            {showInstructions ? (
              <div className="flow-helper-card dismissible">
                <div className="flow-steps-grid">
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
                <button className="dismiss-instructions" type="button" onClick={dismissInstructions} aria-label="Dismiss instructions">
                  Got it ✕
                </button>
              </div>
            ) : (
              <button className="show-instructions-link" type="button" onClick={() => setShowInstructions(true)}>
                How does this work?
              </button>
            )}

            <div className="pick-list">
              {picks.map((pick) => {
                const prediction = getProspectById(livePredictions[pick.number]);
                const isEmpty = !prediction;
                const teamName = teams[teamForPick(pick)]?.name;
                const teamNeeds = teams[teamForPick(pick)]?.needs;
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
                        <>
                          <span className="pick-empty-team">{teamName}</span>
                          {teamNeeds?.length ? <span className="pick-player-meta">Needs {teamNeeds.join(" · ")}</span> : null}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="detail-card inset-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <span className="micro-label">Pool</span>
                  <p style={{ margin: 0 }}>{members.length} members ready for a live draft format. Draft-night picks can still auto-submit from your Big Board if you step away.</p>
                </div>
                <button className="secondary-button" style={{ flexShrink: 0, fontSize: "0.8rem", padding: "6px 12px" }} type="button" onClick={() => navigate("/pool-members")}>
                  View members
                </button>
              </div>
            </div>
          </section>

          <BigBoardTable
            title="Big Board"
            subtitle="Your ranking engine — maps players to picks and powers auto-submit"
            boardIds={bigBoardIds}
            onMove={moveBigBoardItem}
            draftedIds={draftedIds}
            mappedPickByProspectId={mappedPickByProspectId}
            selectedPickLabel={getPickLabel(selectedPickData.number)}
            assignLabel={`Use for ${getPickLabel(selectedPickData.number)}`}
            onAssignSelectedProspect={(prospectId) => saveLivePrediction(selectedPickData.number, prospectId)}
          />
        </div>
      ) : liveTab === "board" ? (
        <BigBoardTable
          title="Big Board"
          subtitle="Your ranking engine — search and assign on the fly"
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
      ) : (
        <>
          <LiveStage
            currentPick={currentPick}
            currentTeam={currentTeam}
            currentSelection={currentSelection}
            currentLocked={currentLocked}
            currentStatus={draftFeed.current_status}
            countdownLabel={countdownCopy(draftFeed.current_status)}
            actualPick={actualCurrentPick}
            suggestedProspect={getProspectById(livePredictions[currentPickNumber])}
            poolState={preRevealPoolState.map((m) => ({
              ...m,
              // merge in result/prospect from currentLivePoolState for reveal
              ...(currentLivePoolState.find((x) => x.id === m.id) ?? {}),
            }))}
            onSubmit={() => submitLiveCard(currentPickNumber)}
            onUseSuggestion={() => setLiveCurrentSelection(currentPickNumber, livePredictions[currentPickNumber])}
            onClearSelection={() => setLiveCurrentSelection(currentPickNumber, null)}
          />

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
                  const isEmpty = !prediction && !lockedCard && !actualPick;
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

        </>
      )}
    </>
  );
}

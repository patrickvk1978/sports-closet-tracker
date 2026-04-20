import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGroup, motion } from "framer-motion";
import BigBoardTable from "../components/BigBoardTable";
import LiveStage from "../components/LiveStage";
import SubmitWindowBanner from "../components/SubmitWindowBanner";
import CenterFeed from "../components/CenterFeed";
import { SkeletonPanel } from "../components/Skeleton";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { useCountdown } from "../hooks/useCountdown";
import { useDraftFeed } from "../hooks/useDraftFeed";
import { useSubmitWindow } from "../hooks/useSubmitWindow";
import { useBigBoard } from "../hooks/useBigBoard";
import { useLiveDraft } from "../hooks/useLiveDraft";
import { useReferenceData } from "../hooks/useReferenceData";

function countdownCopy(status) {
  if (status === "on_clock") return "04:18";
  if (status === "pick_is_in") return "00:24";
  return "SCORED";
}

const PREDRAFT_RECOMMENDATION_SOURCES = [
  {
    key: "board",
    mockLabel: null,
    boardLabelFit: "Best fit from your board",
    boardLabelAvailable: "Best available from your board",
    boardRankField: null,
  },
  {
    key: "pff",
    mockLabel: "PFF mock",
    boardLabelFit: "PFF board",
    boardLabelAvailable: "PFF board",
    boardRankField: "pff_rank",
    mockPickField: "pff_mock_pick",
  },
  {
    key: "athletic",
    mockLabel: "Athletic mock",
    boardLabelFit: "Athletic board",
    boardLabelAvailable: "Athletic board",
    boardRankField: "athletic_rank",
    mockPickField: "athletic_mock_pick",
  },
  {
    key: "ringer",
    mockLabel: "Ringer mock",
    boardLabelFit: "Ringer board",
    boardLabelAvailable: "Ringer board",
    boardRankField: "ringer_rank",
    mockPickField: "ringer_mock_pick",
  },
];

export default function LiveDraftView() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = Boolean(profile?.is_admin);
  const { pool, members } = usePool();
  const { draftFeed, teamCodeForPick } = useDraftFeed();
  const { bigBoardIds, moveBigBoardItem } = useBigBoard();
  const { picks, teams, prospects, getPickLabel, getProspectById, loading: refLoading } = useReferenceData();
  const {
    livePredictions,
    liveCards,
    liveStandings,
    currentLivePoolState,
    scoringConfig,
    saveLivePrediction,
    submitLiveCard,
    resetLiveCard,
    liveResultForPick,
    resolveLivePickForUser,
  } = useLiveDraft({ draftFeed, teamCodeForPick });
  const countdown = useCountdown();

  const [selectedPick, setSelectedPick] = useState(1);
  const [liveTab, setLiveTab] = useState("draft");
  const [pdTab, setPdTab] = useState("command");
  const [leftTab, setLeftTab] = useState("picks"); // "picks" | "feed"
  const [devPhase, setDevPhase] = useState(null); // admin override

  const effectivePhase = isAdmin && devPhase ? devPhase : draftFeed.phase;
  const isPreDraft = effectivePhase === "pre_draft" || !isAdmin;

  const currentPickNumber = draftFeed.current_pick_number;

  // When the live draft advances to a new pick, snap the left column focus
  useEffect(() => {
    if (draftFeed.phase === "live" && draftFeed.current_pick_number) {
      setSelectedPick(draftFeed.current_pick_number);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFeed.current_pick_number, draftFeed.phase]);

  function teamForPick(pick) {
    return draftFeed.team_overrides?.[pick.number] ?? pick.currentTeam;
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const draftedIds = useMemo(() => {
    const blocked = new Set(Object.values(draftFeed.actual_picks ?? {}));
    Object.entries(liveCards).forEach(([pickNum, prospectId]) => {
      if (Number(pickNum) < currentPickNumber) blocked.add(prospectId);
    });
    return blocked;
  }, [draftFeed.actual_picks, liveCards, currentPickNumber]);

  const currentPick = picks.find((p) => p.number === currentPickNumber) ?? picks[0] ?? { number: 1, currentTeam: "" };
  const currentTeam = teams[teamForPick(currentPick)] ?? {};
  const currentLocked = Boolean(liveCards[currentPickNumber]);

  const currentSelectionId = liveCards[currentPickNumber] ?? livePredictions[currentPickNumber] ?? null;
  const currentSelection = getProspectById(currentSelectionId);
  const actualCurrentPick = getProspectById(draftFeed.actual_picks?.[currentPickNumber]);

  // Next pick label for the advance button after reveal
  const nextPick = picks.find((p) => p.number === currentPickNumber + 1);
  const nextTeam = nextPick ? teams[teamForPick(nextPick)] : null;
  const nextPickLabel = nextTeam ? `${nextTeam.name} — Pick ${currentPickNumber + 1}` : null;

  // ── Pre-draft: progress + suggestions ─────────────────────────────────────

  const filledCount = Object.keys(livePredictions).length;
  const totalPicks = picks.length || 32;
  const filledPct = Math.round((filledCount / totalPicks) * 100);

  const focusedPreDraftPick =
    picks.find((p) => p.number === selectedPick) ??
    picks[0] ??
    null;
  const focusedPreDraftTeam = focusedPreDraftPick ? teams[teamForPick(focusedPreDraftPick)] : null;
  const focusedPreDraftPrediction = focusedPreDraftPick
    ? getProspectById(livePredictions[focusedPreDraftPick.number])
    : null;

  const focusedPreDraftSuggestions = useMemo(() => {
    if (!focusedPreDraftPick || !focusedPreDraftTeam) return [];
    const teamNeeds = new Set(focusedPreDraftTeam.needs ?? []);
    const usedIds = new Set(Object.values(livePredictions));
    if (focusedPreDraftPrediction?.id) {
      usedIds.delete(focusedPreDraftPrediction.id);
    }
    const isNeedMatch = (prospect) =>
      prospect.position.split("/").some((pos) => teamNeeds.has(pos));
    const isAvailable = (prospect) =>
      prospect && !draftedIds.has(prospect.id) && !usedIds.has(prospect.id);
    const addOrMerge = (collection, prospect, label) => {
      if (!prospect || !label) return;
      const existing = collection.find((entry) => entry.prospect.id === prospect.id);
      if (existing) {
        if (!existing.sourceLabels.includes(label)) existing.sourceLabels.push(label);
        return;
      }
      collection.push({ prospect, sourceLabels: [label] });
    };
    const bestFromBoard = (rankField, labels) => {
      const candidates = prospects
        .filter((prospect) => isAvailable(prospect))
        .filter((prospect) => (rankField ? prospect[rankField] != null : bigBoardIds.includes(prospect.id)))
        .sort((a, b) => {
          const aScore = rankField ? a[rankField] : bigBoardIds.indexOf(a.id);
          const bScore = rankField ? b[rankField] : bigBoardIds.indexOf(b.id);
          const aRank = aScore === -1 ? 9999 : aScore ?? 9999;
          const bRank = bScore === -1 ? 9999 : bScore ?? 9999;
          const needDelta = Number(isNeedMatch(b)) - Number(isNeedMatch(a));
          if (needDelta !== 0) return needDelta;
          return aRank - bRank;
        });
      if (!candidates.length) return null;
      const prospect = candidates[0];
      const label = isNeedMatch(prospect) ? labels.fit : labels.available;
      return { prospect, label };
    };

    const suggestions = [];

    const boardChoice = focusedPreDraftPrediction ?? bestFromBoard(null, {
      fit: "Best fit from your board",
      available: "Best available from your board",
    })?.prospect;
    if (boardChoice) {
      addOrMerge(
        suggestions,
        boardChoice,
        focusedPreDraftPrediction ? "Current prediction" : (isNeedMatch(boardChoice) ? "Best fit from your board" : "Best available from your board")
      );
    }

    const mockSourceOrder = [
      PREDRAFT_RECOMMENDATION_SOURCES.find((source) => source.key === "pff"),
      PREDRAFT_RECOMMENDATION_SOURCES.find((source) => source.key === "athletic"),
      PREDRAFT_RECOMMENDATION_SOURCES.find((source) => source.key === "ringer"),
    ].filter(Boolean);

    let sourceIndex = 0;
    let fallbackBoardStartIndex = 0;
    while (suggestions.length < 3 && sourceIndex < mockSourceOrder.length) {
      const source = mockSourceOrder[sourceIndex];
      sourceIndex += 1;

      const mockProspect = prospects.find((prospect) => prospect[source.mockPickField] === focusedPreDraftPick.number);
      if (isAvailable(mockProspect)) {
        addOrMerge(suggestions, mockProspect, source.mockLabel);
        continue;
      }

      if (source.key !== "ringer") {
        continue;
      }

      while (suggestions.length < 3 && fallbackBoardStartIndex < mockSourceOrder.length) {
        const boardSource = mockSourceOrder[fallbackBoardStartIndex];
        fallbackBoardStartIndex += 1;
        const boardPick = bestFromBoard(boardSource.boardRankField, {
          fit: boardSource.boardLabelFit,
          available: boardSource.boardLabelAvailable,
        });
        if (boardPick) addOrMerge(suggestions, boardPick.prospect, boardPick.label);
      }
    }

    while (suggestions.length < 3 && fallbackBoardStartIndex < mockSourceOrder.length) {
      const boardSource = mockSourceOrder[fallbackBoardStartIndex];
      fallbackBoardStartIndex += 1;
      const boardPick = bestFromBoard(boardSource.boardRankField, {
        fit: boardSource.boardLabelFit,
        available: boardSource.boardLabelAvailable,
      });
      if (boardPick) addOrMerge(suggestions, boardPick.prospect, boardPick.label);
    }

    return suggestions.slice(0, 3).map(({ prospect, sourceLabels }) => ({
      prospect,
      sourceLabel: sourceLabels.join(" + "),
    }));
  }, [focusedPreDraftPick, focusedPreDraftTeam, focusedPreDraftPrediction, bigBoardIds, draftedIds, livePredictions, getProspectById, prospects]);

  // ── Expert suggestions for LiveStage on_clock ────────────────────────────

  const suggestedProspectForCurrent = getProspectById(livePredictions[currentPickNumber]);

  const EXPERT_SOURCES = [
    { key: "pff_mock_pick",      mockLabel: "PFF Mock Draft",     boardLabel: "PFF Big Board" },
    { key: "athletic_mock_pick", mockLabel: "Athletic Mock Draft", boardLabel: "Athletic Big Board" },
    { key: "ringer_mock_pick",   mockLabel: "Ringer Mock Draft",   boardLabel: "Ringer Big Board" },
  ];

  const expertSuggestions = useMemo(() => {
    if (!currentPick || !currentTeam) return [];
    const hasTradeOverride = Boolean(draftFeed.team_overrides?.[currentPickNumber]);
    const teamNeeds = new Set(currentTeam.needs ?? []);
    const results = [];
    const seenIds = new Set(suggestedProspectForCurrent ? [suggestedProspectForCurrent.id] : []);

    for (const source of EXPERT_SOURCES) {
      let prospect = null;
      let label = null;

      if (!hasTradeOverride) {
        const mockProspect = prospects.find(
          (p) => p[source.key] === currentPickNumber && !draftedIds.has(p.id) && !seenIds.has(p.id)
        );
        if (mockProspect) { prospect = mockProspect; label = source.mockLabel; }
      }

      if (!prospect) {
        const boardProspect = bigBoardIds
          .map((id) => getProspectById(id))
          .filter((p) => p && !draftedIds.has(p.id) && !seenIds.has(p.id))
          .find((p) =>
            teamNeeds.size === 0 || p.position.split("/").some((pos) => teamNeeds.has(pos))
          );
        if (boardProspect) { prospect = boardProspect; label = source.boardLabel; }
      }

      if (prospect) {
        seenIds.add(prospect.id);
        results.push({ label, prospect });
      }
    }
    return results;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPick, currentPickNumber, currentTeam, draftFeed.team_overrides, prospects,
      draftedIds, bigBoardIds, getProspectById, suggestedProspectForCurrent]);

  // ── Pool state for LiveStage ───────────────────────────────────────────────

  const meId = profile?.id;
  const livePoolState = useMemo(() => {
    return currentLivePoolState.map((m) => ({
      ...m,
      isCurrentUser: m.id === meId || m.isCurrentUser,
    }));
  }, [currentLivePoolState, meId]);

  const { secondsLeft: windowSecondsLeft, tier: windowTier } = useSubmitWindow({
    draftFeed,
    currentLocked,
    poolState: livePoolState,
    poolId: pool?.id,
  });

  // ── Left column: CSS class for each pick row ──────────────────────────────

  function pickRowClass(pick) {
    if (pick.number === currentPickNumber) return "current";
    const actualId = draftFeed.actual_picks?.[pick.number];
    if (!actualId) return "";
    const me = livePoolState.find((m) => m.isCurrentUser);
    if (!me || !resolveLivePickForUser) return "done-miss";
    const myProspectId = resolveLivePickForUser(me.id, pick.number);
    const result = liveResultForPick(myProspectId, actualId);
    return result === "exact" || result === "position" ? "done-hit" : "done-miss";
  }

  // ── Loading state ──────────────────────────────────────────────────────────

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

  // ── mappedPickByProspectId helper ──────────────────────────────────────────
  const mappedPickByProspectId = Object.entries(livePredictions).reduce((acc, [num, id]) => {
    if (id) acc[id] = getPickLabel(Number(num));
    return acc;
  }, {});

  const mappedPredictionContextByProspectId = Object.entries(livePredictions).reduce((acc, [num, id]) => {
    if (!id) return acc;
    const pickNumber = Number(num);
    const pick = picks.find((entry) => entry.number === pickNumber);
    const teamName = pick ? teams[teamForPick(pick)]?.name : null;
    acc[id] = teamName ? `${teamName} at ${getPickLabel(pickNumber)}` : getPickLabel(pickNumber);
    return acc;
  }, {});

  function advanceToNextPick(fromPickNumber) {
    const currentIndex = picks.findIndex((pick) => pick.number === fromPickNumber);
    const nextPickNumber = picks[currentIndex + 1]?.number ?? fromPickNumber;
    setSelectedPick(nextPickNumber);
  }

  function handlePreDraftAssign(pickNumber, prospectId) {
    saveLivePrediction(pickNumber, prospectId);
    advanceToNextPick(pickNumber);
  }

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Top nav bar ── */}
      <div className="workspace-nav live-nav">
        <div className="tab-set">
          {isAdmin ? (
            <>
              <button
                className={isPreDraft ? "tab active" : "tab"}
                type="button"
                onClick={() => { setDevPhase("pre_draft"); setLiveTab("draft"); }}
              >
                Pre-draft
              </button>
              <button
                className={!isPreDraft && liveTab === "draft" ? "tab active" : "tab"}
                type="button"
                onClick={() => { setDevPhase("live"); setLiveTab("draft"); }}
              >
                Live Draft
              </button>
              {!isPreDraft ? (
                <button
                  className={liveTab === "board" ? "tab active" : "tab"}
                  type="button"
                  onClick={() => setLiveTab("board")}
                >
                  Big Board
                </button>
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

      {/* ══ PRE-DRAFT ══════════════════════════════════════════════════════ */}
      {isPreDraft && (
        pdTab === "board" ? (
          <>
            <div className="pd-board-ctx">
              <span className="pd-board-ctx-label">Assigning for</span>
              <strong>{getPickLabel(selectedPick)}</strong>
              {focusedPreDraftTeam?.name ? <span className="pd-board-ctx-team">· {focusedPreDraftTeam.name}</span> : null}
              <button
                className="pd-board-ctx-back"
                type="button"
                onClick={() => setPdTab("command")}
              >
                ← Back to draft list
              </button>
            </div>
            <BigBoardTable
              title="Big Board"
              subtitle="Your ranking engine — maps players to picks and powers auto-submit"
              boardIds={bigBoardIds}
              onMove={moveBigBoardItem}
              draftedIds={draftedIds}
              mappedPickByProspectId={mappedPickByProspectId}
              selectedPickLabel={getPickLabel(selectedPick)}
              assignLabel={`Use for ${getPickLabel(selectedPick)}`}
              onAssignSelectedProspect={(prospectId) => {
                handlePreDraftAssign(selectedPick, prospectId);
                setPdTab("command");
              }}
            />
          </>
        ) : (
          <div className="pd-shell">
            <div className="pd-body">
              <div className="pd-left">
                <div className="pd-left-tabs">
                  <div className="pd-left-tab-row">
                    <div className="pd-left-tab active">Draft list</div>
                    <div className="pd-progress-copy">
                      {filledCount} of {totalPicks}
                    </div>
                  </div>
                  <div className="pd-progress-track in-header">
                    <div className="pd-progress-fill" style={{ width: `${filledPct}%` }} />
                  </div>
                  {!countdown.expired ? (
                    <div className="pd-countdown-copy in-header">Draft starts in {countdown.label}</div>
                  ) : (
                    <div className="pd-countdown-copy live in-header">Draft is live</div>
                  )}
                </div>
                <div className="pd-left-picks">
                  {picks.map((pick) => {
                    const prediction = getProspectById(livePredictions[pick.number]);
                    const teamName = teams[teamForPick(pick)]?.name ?? "";
                    const isActive = pick.number === selectedPick;
                    return (
                      <button
                        key={pick.number}
                        className={`pd-pick-row ${isActive ? "active" : ""} ${prediction ? "filled" : "empty"}`}
                        type="button"
                        onClick={() => setSelectedPick(pick.number)}
                      >
                        <span className="pd-pr-num">{pick.number}</span>
                        <span className="pd-pr-body">
                          <span className="pd-pr-team">{teamName}</span>
                          <span className={`pd-pr-pick ${prediction ? "filled" : ""}`}>
                            {prediction ? `Prediction: ${prediction.name}` : "No prediction yet"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pd-center">
                <LiveStage
                  variant="predraft"
                  currentPick={focusedPreDraftPick}
                  currentTeam={focusedPreDraftTeam}
                  currentStatus="on_clock"
                  currentLocked={false}
                  currentSelection={focusedPreDraftPrediction}
                  suggestedProspect={focusedPreDraftPrediction}
                  expertSuggestions={focusedPreDraftSuggestions.map(({ prospect, sourceLabel }) => ({
                    prospect,
                    label: sourceLabel,
                  }))}
                  countdownLabel={countdown.label}
                  actualPick={null}
                  poolState={[]}
                  boardIds={bigBoardIds}
                  prospects={prospects}
                  draftedIds={draftedIds}
                  mappedPickByProspectId={mappedPredictionContextByProspectId}
                  onLockIn={(prospectId) => handlePreDraftAssign(selectedPick, prospectId)}
                  onChangePick={() => saveLivePrediction(selectedPick, null)}
                  nextPickLabel={null}
                  onNextPick={() => {}}
                  scoringConfig={scoringConfig}
                  onViewBigBoard={() => setPdTab("board")}
                />
              </div>
            </div>
          </div>
        )
      )}

      {/* ══ LIVE DRAFT — Big Board tab ══════════════════════════════════════ */}
      {!isPreDraft && liveTab === "board" && (
        <BigBoardTable
          title="Big Board"
          subtitle="Your ranking engine — search and assign on the fly"
          boardIds={bigBoardIds}
          onMove={moveBigBoardItem}
          draftedIds={draftedIds}
          mappedPickByProspectId={mappedPickByProspectId}
          selectedPickLabel={getPickLabel(currentPickNumber)}
          assignLabel={`Use for Pick ${currentPickNumber}`}
          onAssignSelectedProspect={(prospectId) => saveLivePrediction(currentPickNumber, prospectId)}
        />
      )}

      {/* ══ LIVE DRAFT — Command center ══════════════════════════════════════ */}
      {!isPreDraft && liveTab === "draft" && (
        <div className="dn-shell">

          {/* Subbar */}
          <div className="dn-subbar">
            <span className="dn-live-badge">● LIVE</span>
            <span className="dn-pick-indicator">
              Pick <strong>{currentPickNumber}</strong> · {currentTeam?.name ?? "—"}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "var(--dn-muted)" }}>
              {livePoolState.filter((m) => m.locked).length}/{livePoolState.length} locked
            </span>
          </div>

          <div className="dn-body">

            {/* ── Left: pick timeline / Bluesky feed toggle ── */}
            <div className="dn-left">
              <div className="dn-left-tabs">
                <button
                  className={`dn-left-tab ${leftTab === "picks" ? "active" : ""}`}
                  type="button"
                  onClick={() => setLeftTab("picks")}
                >
                  Picks
                </button>
                <button
                  className={`dn-left-tab ${leftTab === "feed" ? "active" : ""}`}
                  type="button"
                  onClick={() => setLeftTab("feed")}
                >
                  🦋 Feed
                </button>
              </div>

              {leftTab === "picks" ? (
                <div className="dn-left-picks">
                  {picks.map((pick) => {
                    const rowClass = pickRowClass(pick);
                    const actualId = draftFeed.actual_picks?.[pick.number];
                    const actualProspect = getProspectById(actualId);
                    const predictedProspect = getProspectById(livePredictions[pick.number]);
                    const teamName = teams[teamForPick(pick)]?.name ?? "";
                    const isCurrent = pick.number === currentPickNumber;
                    return (
                      <div
                        key={pick.number}
                        className={`dn-pick-row ${rowClass}`}
                        onClick={() => !isCurrent && setSelectedPick(pick.number)}
                        style={{ cursor: isCurrent ? "default" : "pointer" }}
                      >
                        <span className="dn-pr-num">{pick.number}</span>
                        <div className="dn-pr-body">
                          <span className="dn-pr-team">{teamName}</span>
                          {actualProspect ? (
                            <span className="dn-pr-pick">{actualProspect.name}</span>
                          ) : isCurrent ? (
                            <span className="dn-pr-pick" style={{ color: "var(--dn-red)", opacity: 0.7 }}>on the clock</span>
                          ) : predictedProspect ? (
                            <span className="dn-pr-pick prediction">Prediction: {predictedProspect.name}</span>
                          ) : null}
                        </div>
                        {rowClass === "done-hit" && <span className="dn-pr-result hit">✓</span>}
                        {rowClass === "done-miss" && <span className="dn-pr-result miss">✗</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <CenterFeed isLive={draftFeed.phase === "live"} />
              )}
            </div>

            {/* ── Center: live stage ── */}
            <div className="dn-center">
              <SubmitWindowBanner
                secondsLeft={windowSecondsLeft}
                tier={windowTier}
                currentLocked={currentLocked}
                poolState={livePoolState}
              />
              <LiveStage
                currentPick={currentPick}
                currentTeam={currentTeam}
                currentStatus={draftFeed.current_status}
                currentLocked={currentLocked}
                currentSelection={currentSelection}
                suggestedProspect={suggestedProspectForCurrent}
                expertSuggestions={expertSuggestions}
                countdownLabel={countdownCopy(draftFeed.current_status)}
                actualPick={actualCurrentPick}
                poolState={livePoolState}
                boardIds={bigBoardIds}
                prospects={prospects}
                draftedIds={draftedIds}
                onLockIn={(prospectId) => submitLiveCard(currentPickNumber, prospectId)}
                onChangePick={() => resetLiveCard(currentPickNumber)}
                nextPickLabel={nextPickLabel}
                onNextPick={() => {}}
                scoringConfig={scoringConfig}
              />
            </div>

            {/* ── Right: standings + pool activity ── */}
            <div className="dn-right">

              <div className="dn-right-section">
                <div className="dn-rs-label">Standings</div>
                <LayoutGroup id="live-standings">
                  {liveStandings.map((player, idx) => {
                    const isMe = livePoolState.find((m) => m.isCurrentUser && m.name === player.name);
                    return (
                      <motion.div
                        key={player.id ?? player.name}
                        layout
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="dn-standings-row"
                      >
                        <span className={`dn-st-rank ${idx === 0 ? "top" : ""}`}>{idx + 1}</span>
                        <span className={`dn-st-name ${isMe ? "me" : ""}`}>{player.name}</span>
                        <span className={`dn-st-pts ${isMe ? "me" : ""}`}>{player.points}pt</span>
                      </motion.div>
                    );
                  })}
                </LayoutGroup>
              </div>

              <div className="dn-right-section">
                <div className="dn-rs-label">
                  Pick {currentPickNumber} · Pool
                  <span className="dn-pool-count-badge">
                    {livePoolState.filter((m) => m.isCurrentUser ? currentLocked : m.locked).length}/{livePoolState.length} locked
                  </span>
                </div>
                {livePoolState.map((m) => {
                  const isLocked = m.isCurrentUser ? currentLocked : m.locked;
                  const avatarCls = m.isCurrentUser ? "me" : isLocked ? "submitted" : "pending";
                  const initials = m.name.slice(0, 2).toUpperCase();
                  return (
                    <div key={m.id ?? m.name} className="dn-pool-member-row">
                      <div className={`dn-pool-avatar ${avatarCls}${!isLocked ? " pulsing" : ""}`}>
                        {initials}
                      </div>
                      <div className="dn-pool-member-info">
                        <span className="dn-pool-member-name">{m.isCurrentUser ? "you" : m.name}</span>
                        <span className={`dn-pool-member-status ${isLocked ? "locked" : "deciding"}`}>
                          {isLocked ? "locked ✓" : "deciding…"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: "0 14px" }}>
                <div className="dn-rs-label">Pool</div>
                <div style={{ fontSize: 12, color: "var(--dn-muted)" }}>
                  {members.length} member{members.length !== 1 ? "s" : ""}
                </div>
                <button
                  type="button"
                  style={{ marginTop: 8, fontSize: 11, color: "var(--dn-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                  onClick={() => navigate("/pool-members")}
                >
                  View all →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

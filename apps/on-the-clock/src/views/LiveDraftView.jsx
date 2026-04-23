import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { useWatchlists } from "../hooks/useWatchlists";

const MOBILE_POSITION_OPTIONS = ["ALL", "QB", "WR", "OT", "EDGE", "CB", "DT", "RB", "LB", "S", "TE", "WATCHLIST"];

export default function LiveDraftView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, session } = useAuth();
  const isAdmin = Boolean(profile?.is_admin);
  const { pool, members } = usePool();
  const { draftFeed, teamCodeForPick, advanceDraft } = useDraftFeed();
  const { bigBoardIds, moveBigBoardItem, saveBigBoard } = useBigBoard();
  const { picks, teams, prospects, getPickLabel, getProspectById, defaultBigBoardIds, loading: refLoading } = useReferenceData();
  const {
    livePredictions,
    liveCards,
    liveStandings,
    currentLivePoolState,
    allFinalizedPicks,
    scoringConfig,
    saveLivePrediction,
    submitLiveCard,
    resetLiveCard,
    liveResultForPick,
    resolveLivePickForUser,
  } = useLiveDraft({ draftFeed, teamCodeForPick });
  const { watchlistsByTeam, addToWatchlist, removeFromWatchlist } = useWatchlists();
  const countdown = useCountdown();

  const [selectedPick, setSelectedPick] = useState(1);
  const [liveTab, setLiveTab] = useState("draft");
  const [pdTab, setPdTab] = useState("command");
  const [leftTab, setLeftTab] = useState("picks"); // "picks" | "feed"
  const [devPhase, setDevPhase] = useState(null); // admin override
  const [isMobilePredraft, setIsMobilePredraft] = useState(false);
  const [isMobileLive, setIsMobileLive] = useState(false);
  const [mobilePredraftSheetOpen, setMobilePredraftSheetOpen] = useState(false);
  const [mobileLiveFilter, setMobileLiveFilter] = useState("ALL");
  const [mobileStandingsOpen, setMobileStandingsOpen] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [previewCards, setPreviewCards] = useState({});
  const [previewReveals, setPreviewReveals] = useState({});

  const effectivePhase = isAdmin && devPhase ? devPhase : draftFeed.phase;
  const isPreDraft = effectivePhase === "pre_draft" || !isAdmin;
  const isPreviewMode = searchParams.get("preview") === "1";
  const previewStatus = searchParams.get("status") ?? draftFeed.current_status;
  const previewPickNumber = Number(searchParams.get("pick") ?? draftFeed.current_pick_number);

  const currentPickNumber = isPreviewMode ? previewPickNumber : draftFeed.current_pick_number;

  // When the live draft advances to a new pick, snap the left column focus
  useEffect(() => {
    if (draftFeed.phase === "live" && draftFeed.current_pick_number) {
      setSelectedPick(draftFeed.current_pick_number);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFeed.current_pick_number, draftFeed.phase]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 980px)");
    const sync = () => {
      setIsMobilePredraft(media.matches);
      setIsMobileLive(media.matches);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isMobilePredraft) {
      setMobilePredraftSheetOpen(false);
    }
  }, [isMobilePredraft]);

  useEffect(() => {
    if (!isMobileLive) {
      setMobileStandingsOpen(false);
    }
  }, [isMobileLive]);

  useEffect(() => {
    const intervalId = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  function teamForPick(pick) {
    return draftFeed.team_overrides?.[pick.number] ?? pick.currentTeam;
  }

  function watchlistIdsForPick(pick) {
    if (!pick) return [];
    const teamCodes = [
      draftFeed.team_overrides?.[pick.number],
      pick.currentTeam,
      pick.originalTeam,
    ].filter(Boolean);
    return [...new Set(teamCodes.flatMap((teamCode) => watchlistsByTeam[teamCode] ?? []))];
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const draftedIds = useMemo(() => {
    const actualMap = isPreviewMode
      ? { ...(draftFeed.actual_picks ?? {}), ...previewReveals }
      : draftFeed.actual_picks ?? {};
    const liveCardMap = isPreviewMode ? previewCards : liveCards;
    const blocked = new Set(Object.values(actualMap));
    Object.entries(liveCardMap).forEach(([pickNum, prospectId]) => {
      if (Number(pickNum) < currentPickNumber) blocked.add(prospectId);
    });
    return blocked;
  }, [draftFeed.actual_picks, liveCards, currentPickNumber, isPreviewMode, previewCards, previewReveals]);

  const currentPick = picks.find((p) => p.number === currentPickNumber) ?? picks[0] ?? { number: 1, currentTeam: "" };
  const currentTeam = teams[teamForPick(currentPick)] ?? {};
  const userId = session?.user?.id ?? profile?.id ?? null;
  const currentUserFinalized = userId ? allFinalizedPicks?.[`${userId}:${currentPickNumber}`] ?? null : null;
  const currentLocked = isPreviewMode
    ? Boolean(previewCards[currentPickNumber])
    : Boolean(currentUserFinalized?.prospectId || (teamForPick(currentPick) === currentPick.originalTeam ? liveCards[currentPickNumber] : null));

  const currentSelectionId = isPreviewMode
    ? previewCards[currentPickNumber] ?? livePredictions[currentPickNumber] ?? null
    : currentUserFinalized?.prospectId ?? liveCards[currentPickNumber] ?? livePredictions[currentPickNumber] ?? null;
  const currentSelection = getProspectById(currentSelectionId);
  const actualCurrentPick = getProspectById((isPreviewMode ? previewReveals[currentPickNumber] : null) ?? draftFeed.actual_picks?.[currentPickNumber]);

  // Next pick label for the advance button after reveal
  const nextPick = picks.find((p) => p.number === currentPickNumber + 1);
  const nextTeam = nextPick ? teams[teamForPick(nextPick)] : null;
  const nextPickLabel = nextTeam ? `${nextTeam.name} — Pick ${currentPickNumber + 1}` : null;
  const effectiveCurrentStatus = isPreviewMode ? previewStatus : draftFeed.current_status;
  const shouldShowNextUp = ["awaiting_reveal", "revealed"].includes(effectiveCurrentStatus) && Boolean(nextPick);
  const nextPickTeamCode = nextPick ? teamForPick(nextPick) : null;
  const nextPickAllowsSlotContext = nextPick ? teamForPick(nextPick) === nextPick.originalTeam : false;
  const nextUserFinalized = userId && nextPick ? allFinalizedPicks?.[`${userId}:${nextPick.number}`] ?? null : null;
  const nextLocked = isPreviewMode
    ? Boolean(nextPick ? previewCards[nextPick.number] : null)
    : Boolean(nextUserFinalized?.prospectId || (nextPickAllowsSlotContext && nextPick ? liveCards[nextPick.number] : null));
  const nextSelectionId = nextPick
    ? (isPreviewMode
        ? previewCards[nextPick.number] ?? livePredictions[nextPick.number] ?? null
        : nextUserFinalized?.prospectId ?? liveCards[nextPick.number] ?? livePredictions[nextPick.number] ?? null)
    : null;
  const nextSelection = getProspectById(nextSelectionId);
  const nextWatchlistIds = watchlistIdsForPick(nextPick);

  const nextUpRows = useMemo(() => {
    if (!shouldShowNextUp || !nextPick) return [];

    const nextWatchlistSet = new Set(nextWatchlistIds);
    const predictedId = nextPickAllowsSlotContext ? livePredictions[nextPick.number] ?? null : null;

    return prospects
      .filter((prospect) => !draftedIds.has(prospect.id))
      .sort((a, b) => {
        const aSelected = nextSelectionId === a.id ? 1 : 0;
        const bSelected = nextSelectionId === b.id ? 1 : 0;
        if (aSelected !== bSelected) return bSelected - aSelected;

        const aPredicted = predictedId === a.id ? 1 : 0;
        const bPredicted = predictedId === b.id ? 1 : 0;
        if (aPredicted !== bPredicted) return bPredicted - aPredicted;

        const aWatch = nextWatchlistSet.has(a.id) ? 1 : 0;
        const bWatch = nextWatchlistSet.has(b.id) ? 1 : 0;
        if (aWatch !== bWatch) return bWatch - aWatch;

        const aRank = bigBoardIds.indexOf(a.id);
        const bRank = bigBoardIds.indexOf(b.id);
        return (aRank === -1 ? 9999 : aRank) - (bRank === -1 ? 9999 : bRank);
      });
  }, [shouldShowNextUp, nextPick, nextWatchlistIds, nextPickAllowsSlotContext, livePredictions, nextSelectionId, prospects, draftedIds, bigBoardIds]);

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

  // ── Watchlist derivations ─────────────────────────────────────────────────
  const focusedTeamCode = focusedPreDraftPick ? teamForPick(focusedPreDraftPick) : null;
  const currentTeamCode = currentPick ? teamForPick(currentPick) : null;
  const focusedWatchlistIds = watchlistIdsForPick(focusedPreDraftPick);
  const currentWatchlistIds = watchlistIdsForPick(currentPick);
  const currentWatchlistSet = useMemo(() => new Set(currentWatchlistIds), [currentWatchlistIds]);

  const mobileListRows = useMemo(() => {
    if (!isMobileLive || isPreDraft) return [];
    const allowSlotContext = teamForPick(currentPick) === currentPick.originalTeam;
    const predictedId = allowSlotContext ? livePredictions[currentPickNumber] ?? null : null;

    return prospects
      .filter((prospect) => !draftedIds.has(prospect.id))
      .filter((prospect) => {
        if (mobileLiveFilter === "ALL") return true;
        if (mobileLiveFilter === "WATCHLIST") return currentWatchlistSet.has(prospect.id);
        return prospect.position.includes(mobileLiveFilter);
      })
      .sort((a, b) => {
        const aSelected = currentSelectionId === a.id ? 1 : 0;
        const bSelected = currentSelectionId === b.id ? 1 : 0;
        if (aSelected !== bSelected) return bSelected - aSelected;

        const aPredicted = predictedId === a.id ? 1 : 0;
        const bPredicted = predictedId === b.id ? 1 : 0;
        if (aPredicted !== bPredicted) return bPredicted - aPredicted;

        const aWatch = currentWatchlistSet.has(a.id) ? 1 : 0;
        const bWatch = currentWatchlistSet.has(b.id) ? 1 : 0;
        if (aWatch !== bWatch) return bWatch - aWatch;

        const aRank = bigBoardIds.indexOf(a.id);
        const bRank = bigBoardIds.indexOf(b.id);
        return (aRank === -1 ? 9999 : aRank) - (bRank === -1 ? 9999 : bRank);
      });
  }, [
    isMobileLive,
    isPreDraft,
    currentPick,
    livePredictions,
    currentPickNumber,
    prospects,
    draftedIds,
    mobileLiveFilter,
    currentWatchlistSet,
    currentSelectionId,
    bigBoardIds,
  ]);

  const meId = profile?.id;
  const livePoolState = useMemo(() => {
    return currentLivePoolState.map((m) => ({
      ...m,
      isCurrentUser: m.id === meId || m.isCurrentUser,
    }));
  }, [currentLivePoolState, meId]);

  const meStanding = useMemo(() => {
    return liveStandings.find((player) => player.id === meId) ?? null;
  }, [liveStandings, meId]);

  const mobileStatusCopy =
    effectiveCurrentStatus === "pick_is_in"
      ? "Pick is in"
      : effectiveCurrentStatus === "awaiting_reveal"
        ? "Awaiting reveal"
        : effectiveCurrentStatus === "revealed"
          ? "Pick revealed"
          : currentLocked
            ? "Pick submitted"
            : "Awaiting pick";

  // ── Pool state for LiveStage ───────────────────────────────────────────────

  const { secondsLeft: windowSecondsLeft, tier: windowTier } = useSubmitWindow({
    draftFeed,
    currentLocked,
    poolState: livePoolState,
    poolId: pool?.id,
  });

  const previewWindowSecondsLeft = useMemo(() => {
    if (!isPreviewMode || previewStatus !== "pick_is_in") return windowSecondsLeft;
    return 20;
  }, [isPreviewMode, previewStatus, windowSecondsLeft]);

  const previewWindowTier = isPreviewMode && previewStatus === "pick_is_in" ? "active" : windowTier;

  useEffect(() => {
    if (effectiveCurrentStatus !== "revealed") return undefined;

    const timer = window.setTimeout(() => {
      if (isPreviewMode) {
        if (nextPick) {
          setPreviewPickNumberValue(nextPick.number);
          setPreviewStatusValue("on_clock");
        }
        return;
      }
      void advanceDraft();
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [effectiveCurrentStatus, isPreviewMode, nextPick, advanceDraft]);

  function formatClockLabel(expiresAt) {
    if (!expiresAt) return null;
    const target = new Date(expiresAt).getTime();
    if (Number.isNaN(target)) return null;
    const deltaMs = target - clockNow;
    if (deltaMs <= 0) return "00:00";
    const totalSeconds = Math.floor(deltaMs / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  const providerClockLabel =
    effectiveCurrentStatus === "on_clock"
      ? formatClockLabel(draftFeed.provider_expires_at)
      : null;

  const nextContextClockLabel =
    effectiveCurrentStatus !== "on_clock"
      ? formatClockLabel(draftFeed.provider_expires_at)
      : null;

  const stageCountdownLabel = isPreviewMode && effectiveCurrentStatus === "on_clock"
    ? (providerClockLabel ?? "04:18")
    : providerClockLabel;
  const stageCountdownPrefix = stageCountdownLabel ? "On the clock" : null;

  // ── Left column: CSS class for each pick row ──────────────────────────────

  function pickRowClass(pick) {
    if (pick.number === currentPickNumber) return "current";
    const actualId = (isPreviewMode ? previewReveals[pick.number] : null) ?? draftFeed.actual_picks?.[pick.number];
    if (!actualId) return "";
    const me = livePoolState.find((m) => m.isCurrentUser);
    if (!me || !resolveLivePickForUser) return "done-miss";
    const myProspectId = resolveLivePickForUser(me.id, pick.number);
    const result = liveResultForPick(myProspectId, actualId);
    return result === "exact" || result === "position" ? "done-hit" : "done-miss";
  }

  function updatePreviewParams(updates) {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === "") next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next, { replace: true });
  }

  function setPreviewStatusValue(status) {
    updatePreviewParams({ preview: "1", status, pick: currentPickNumber });
    if (status !== "revealed") {
      setPreviewReveals((prev) => {
        const next = { ...prev };
        delete next[currentPickNumber];
        return next;
      });
    }
  }

  function setPreviewPickNumberValue(pickNumber) {
    const clamped = Math.max(1, Math.min(pickNumber, totalPicks));
    updatePreviewParams({ preview: "1", pick: clamped, status: previewStatus });
  }

  function handlePreviewLockIn(pickNumber, prospectId) {
    setPreviewCards((prev) => ({ ...prev, [pickNumber]: prospectId }));
  }

  function handlePreviewReset(pickNumber) {
    setPreviewCards((prev) => {
      const next = { ...prev };
      delete next[pickNumber];
      return next;
    });
  }

  function handlePreviewReveal() {
    const revealId = currentSelectionId ?? prospects.find((prospect) => !draftedIds.has(prospect.id))?.id ?? null;
    if (!revealId) return;
    setPreviewReveals((prev) => ({ ...prev, [currentPickNumber]: revealId }));
    setPreviewStatusValue("revealed");
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
    if (isMobilePredraft) {
      setMobilePredraftSheetOpen(true);
    }
  }

  function handlePreDraftPickSelect(pickNumber) {
    setSelectedPick(pickNumber);
    if (isMobilePredraft) {
      setMobilePredraftSheetOpen(true);
    }
  }

  function mobileBadgesForProspect(prospect) {
    const badges = [];
    if (currentWatchlistSet.has(prospect.id)) badges.push("W");
    if (prospect.ringer_mock_pick === currentPickNumber) badges.push("R");
    if (prospect.athletic_mock_pick === currentPickNumber) badges.push("A");
    if (prospect.espn_mock_pick === currentPickNumber) badges.push("E");
    if (prospect.consensus_mock_pick === currentPickNumber) badges.push("C");
    return badges;
  }

  function handleMobileSelectProspect(prospectId) {
    if (isPreviewMode) {
      handlePreviewLockIn(currentPickNumber, prospectId);
      return;
    }
    void submitLiveCard(currentPickNumber, prospectId);
  }

  function ordinalSuffix(rank) {
    if (rank % 100 >= 11 && rank % 100 <= 13) return "th";
    if (rank % 10 === 1) return "st";
    if (rank % 10 === 2) return "nd";
    if (rank % 10 === 3) return "rd";
    return "th";
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
          {isPreviewMode ? (
            <div className="preview-chip">Preview mode</div>
          ) : null}
          {!(isMobilePredraft && isPreDraft) ? (
            <div className={`countdown-clock ${countdown.expired ? "live" : ""}`}>
              <span className="countdown-label">{countdown.expired ? "DRAFT IS LIVE" : "Draft starts in"}</span>
              {!countdown.expired ? <span className="countdown-time">{countdown.label}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ══ PRE-DRAFT ══════════════════════════════════════════════════════ */}
      {isPreDraft && (
        pdTab === "board" ? (
          <>
            <BigBoardTable
              title="Big Board"
              subtitle="Your ranking engine — assign any player to any pick or a team's watchlist"
              onBack={() => setPdTab("command")}
              boardIds={bigBoardIds}
              onMove={moveBigBoardItem}
              onResetBoard={() => saveBigBoard(defaultBigBoardIds)}
              draftedIds={draftedIds}
              mappedPickByProspectId={mappedPickByProspectId}
              livePredictions={livePredictions}
              watchlistsByTeam={watchlistsByTeam}
              teamCodeForPick={(pickNumber) => {
                const pick = picks.find((p) => p.number === pickNumber);
                return pick ? teamForPick(pick) : null;
              }}
              onSetPrediction={(pickNumber, prospectId) => saveLivePrediction(pickNumber, prospectId)}
              onAddToWatchlist={(teamCode, prospectId) => addToWatchlist(teamCode, prospectId)}
              onRemoveFromWatchlist={(teamCode, prospectId) => removeFromWatchlist(teamCode, prospectId)}
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
                    const teamCode = teamForPick(pick);
                    const teamName = teams[teamCode]?.name ?? "";
                    const isActive = pick.number === selectedPick;
                    const wlCount = teamCode ? (watchlistsByTeam[teamCode]?.length ?? 0) : 0;
                    return (
                      <button
                        key={pick.number}
                        className={`pd-pick-row ${isActive ? "active" : ""} ${prediction ? "filled" : "empty"}`}
                        type="button"
                        onClick={() => handlePreDraftPickSelect(pick.number)}
                      >
                        <span className="pd-pr-num">{pick.number}</span>
                        <span className="pd-pr-body">
                          <span className="pd-pr-team">
                            {teamName}
                            {wlCount > 0 ? (
                              <span style={{ marginLeft: 6, fontSize: 10, color: "var(--dn-muted, #8b95a6)" }}>
                                ◆ {wlCount}
                              </span>
                            ) : null}
                          </span>
                          <span className={`pd-pr-pick ${prediction ? "filled" : ""}`}>
                            {prediction ? `Prediction: ${prediction.name}` : "No prediction yet"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`pd-center ${isMobilePredraft ? "mobile-hidden" : ""}`}>
                <LiveStage
                  variant="predraft"
                  currentPick={focusedPreDraftPick}
                  currentTeam={focusedPreDraftTeam}
                  activeTeamCode={focusedTeamCode}
                  currentStatus="on_clock"
                  currentLocked={false}
                  currentSelection={focusedPreDraftPrediction}
                  suggestedProspect={null}
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
                  onViewBigBoard={isMobilePredraft ? undefined : () => setPdTab("board")}
                  activeWatchlistIds={focusedWatchlistIds}
                  onAddToWatchlist={(teamCode, prospectId) => addToWatchlist(teamCode, prospectId)}
                  onRemoveFromWatchlist={(teamCode, prospectId) => removeFromWatchlist(teamCode, prospectId)}
                />
              </div>

              {isMobilePredraft && mobilePredraftSheetOpen ? (
                <div
                  className="pd-mobile-sheet-backdrop"
                  role="presentation"
                  onClick={() => setMobilePredraftSheetOpen(false)}
                >
                  <div
                    className="pd-mobile-sheet"
                    role="dialog"
                    aria-modal="true"
                    aria-label={focusedPreDraftTeam ? `${focusedPreDraftTeam.name} player picker` : "Player picker"}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="pd-mobile-sheet-handle" aria-hidden="true" />
                    <button
                      type="button"
                      className="pd-mobile-sheet-close"
                      onClick={() => setMobilePredraftSheetOpen(false)}
                      aria-label="Close player picker"
                    >
                      ×
                    </button>
                    <LiveStage
                      variant="predraft"
                      currentPick={focusedPreDraftPick}
                      currentTeam={focusedPreDraftTeam}
                      activeTeamCode={focusedTeamCode}
                      currentStatus="on_clock"
                      currentLocked={false}
                      currentSelection={focusedPreDraftPrediction}
                      suggestedProspect={null}
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
                      onViewBigBoard={undefined}
                      activeWatchlistIds={focusedWatchlistIds}
                      onAddToWatchlist={(teamCode, prospectId) => addToWatchlist(teamCode, prospectId)}
                      onRemoveFromWatchlist={(teamCode, prospectId) => removeFromWatchlist(teamCode, prospectId)}
                    />
                  </div>
                </div>
              ) : null}
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
          onResetBoard={() => saveBigBoard(defaultBigBoardIds)}
          draftedIds={draftedIds}
          mappedPickByProspectId={mappedPickByProspectId}
          livePredictions={livePredictions}
          watchlistsByTeam={watchlistsByTeam}
          teamCodeForPick={(pickNumber) => {
            const pick = picks.find((p) => p.number === pickNumber);
            return pick ? teamForPick(pick) : null;
          }}
          onSetPrediction={(pickNumber, prospectId) => saveLivePrediction(pickNumber, prospectId)}
          onAddToWatchlist={(teamCode, prospectId) => addToWatchlist(teamCode, prospectId)}
          onRemoveFromWatchlist={(teamCode, prospectId) => removeFromWatchlist(teamCode, prospectId)}
        />
      )}

      {!isPreDraft && liveTab === "draft" && isMobileLive && (
        <div className="mobile-live-shell">
          <div className="mobile-live-topcard">
            <div className="mobile-live-topline">
              <span className="mobile-live-pick">Pick {currentPickNumber}</span>
              <span className={`mobile-live-status ${effectiveCurrentStatus}`}>{mobileStatusCopy}</span>
            </div>
            <div className="mobile-live-team">{currentTeam?.name ?? "—"}</div>
            <div className="mobile-live-controls">
              <select
                className="mobile-live-filter"
                value={mobileLiveFilter}
                onChange={(event) => setMobileLiveFilter(event.target.value)}
              >
                {MOBILE_POSITION_OPTIONS.filter((option) => option !== "WATCHLIST" || currentWatchlistIds.length > 0).map((option) => (
                  <option key={option} value={option}>
                    {option === "WATCHLIST" ? "Watchlist" : option}
                  </option>
                ))}
              </select>
              <div className="mobile-live-clock-stack">
                <span className="mobile-live-clock-label">
                  {effectiveCurrentStatus === "pick_is_in" ? "Locks in" : effectiveCurrentStatus}
                </span>
                <span className="mobile-live-clock-value">
                  {effectiveCurrentStatus === "pick_is_in"
                    ? `${String(previewWindowSecondsLeft ?? 20).padStart(2, "0")}s`
                    : stageCountdownLabel ?? "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="mobile-live-main">
            {(effectiveCurrentStatus === "on_clock" || effectiveCurrentStatus === "pick_is_in") && !currentLocked ? (
              <div className="mobile-live-list">
                {mobileListRows.map((prospect) => {
                  const badges = mobileBadgesForProspect(prospect);
                  return (
                    <button
                      key={prospect.id}
                      type="button"
                      className="mobile-live-row"
                      onClick={() => handleMobileSelectProspect(prospect.id)}
                    >
                      <div className="mobile-live-row-main">
                        <span className="mobile-live-row-name">{prospect.name}</span>
                        <span className="mobile-live-row-meta">{prospect.position} · {prospect.school}</span>
                      </div>
                      <div className="mobile-live-row-side">
                        <span className="mobile-live-row-rank">
                          #{(bigBoardIds.indexOf(prospect.id) === -1 ? "—" : bigBoardIds.indexOf(prospect.id) + 1)}
                        </span>
                        <div className="mobile-live-row-badges">
                          {badges.map((badge) => (
                            <span key={`${prospect.id}-${badge}`} className={`mobile-live-badge ${badge === "W" ? "watch" : ""}`}>
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mobile-live-stage">
                <LiveStage
                  currentPick={currentPick}
                  currentTeam={currentTeam}
                  activeTeamCode={currentTeamCode}
                  currentStatus={effectiveCurrentStatus}
                  currentLocked={currentLocked}
                  currentSelection={currentSelection}
                  suggestedProspect={null}
                  countdownLabel={stageCountdownLabel}
                  countdownPrefix={stageCountdownPrefix}
                  actualPick={actualCurrentPick}
                  poolState={livePoolState}
                  boardIds={bigBoardIds}
                  prospects={prospects}
                  draftedIds={draftedIds}
                  mappedPickByProspectId={mappedPredictionContextByProspectId}
                  onLockIn={(prospectId) => (isPreviewMode ? handlePreviewLockIn(currentPickNumber, prospectId) : submitLiveCard(currentPickNumber, prospectId))}
                  onChangePick={() => (isPreviewMode ? handlePreviewReset(currentPickNumber) : resetLiveCard(currentPickNumber))}
                  nextPickLabel={null}
                  onNextPick={() => {}}
                  scoringConfig={scoringConfig}
                  activeWatchlistIds={currentWatchlistIds}
                  onAddToWatchlist={() => Promise.resolve()}
                  onRemoveFromWatchlist={() => Promise.resolve()}
                />
              </div>
            )}
          </div>

          <div className="mobile-live-pooldots">
            {livePoolState.map((member) => {
              const isLocked = member.isCurrentUser ? currentLocked : member.locked;
              const isWarning = !isLocked && previewWindowSecondsLeft != null && previewWindowSecondsLeft <= 20 && previewWindowSecondsLeft > 0;
              const cls = isLocked ? "locked" : isWarning ? "warning" : "waiting";
              return (
                <div key={member.id ?? member.name} className="mobile-live-dot-wrap">
                  <div className={`mobile-live-dot ${cls}`} />
                  <span className="mobile-live-dot-label">{member.isCurrentUser ? "You" : (member.name ?? "—").slice(0, 3)}</span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="mobile-live-scorebar"
            onClick={() => setMobileStandingsOpen((prev) => !prev)}
          >
            <span>{meStanding ? `You: ${liveStandings.findIndex((player) => player.id === meStanding.id) + 1}${ordinalSuffix(liveStandings.findIndex((player) => player.id === meStanding.id) + 1)} · ${meStanding.points} pts` : "View standings"}</span>
            <span>{mobileStandingsOpen ? "Hide" : "Standings"}</span>
          </button>

          {mobileStandingsOpen ? (
            <div className="mobile-live-standings">
              {liveStandings.map((player, idx) => (
                <div key={player.id ?? player.name} className={`mobile-live-standing-row ${player.id === meId ? "me" : ""}`}>
                  <span>{idx + 1}</span>
                  <span>{player.name}</span>
                  <span>{player.points} pts</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* ══ LIVE DRAFT — Command center ══════════════════════════════════════ */}
      {!isPreDraft && liveTab === "draft" && !isMobileLive && (
        <div className="dn-shell">
          {isPreviewMode ? (
            <div className="preview-toolbar">
              <div className="preview-toolbar-group">
                <span className="preview-toolbar-label">Preview</span>
                <button type="button" className="preview-toolbar-btn" onClick={() => setPreviewPickNumberValue(currentPickNumber - 1)}>← Pick</button>
                <button type="button" className="preview-toolbar-btn" onClick={() => setPreviewPickNumberValue(currentPickNumber + 1)}>Pick →</button>
              </div>
              <div className="preview-toolbar-group">
                {["on_clock", "pick_is_in", "awaiting_reveal", "revealed"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`preview-toolbar-btn ${previewStatus === status ? "active" : ""}`}
                    onClick={() => setPreviewStatusValue(status)}
                  >
                    {status.replace(/_/g, " ")}
                  </button>
                ))}
                <button type="button" className="preview-toolbar-btn accent" onClick={handlePreviewReveal}>
                  Reveal sample
                </button>
                <button type="button" className="preview-toolbar-btn" onClick={() => updatePreviewParams({ preview: null, status: null, pick: null })}>
                  Exit preview
                </button>
              </div>
            </div>
          ) : null}

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
                    const actualId = (isPreviewMode ? previewReveals[pick.number] : null) ?? draftFeed.actual_picks?.[pick.number];
                    const actualProspect = getProspectById(actualId);
                    const predictedProspect = getProspectById(livePredictions[pick.number]);
                    const teamName = teams[teamForPick(pick)]?.name ?? "";
                    const isCurrent = pick.number === currentPickNumber;
                    const showNextClock = effectiveCurrentStatus !== "on_clock" && nextPick && pick.number === nextPick.number && nextContextClockLabel;
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
                            <span className="dn-pr-pick">{`${actualProspect.name} · ${actualProspect.position}`}</span>
                          ) : isCurrent ? (
                            <span className="dn-pr-pick" style={{ color: "var(--dn-red)", opacity: 0.7 }}>on the clock</span>
                          ) : showNextClock ? (
                            <span className="dn-pr-pick prediction">{`Clock: ${nextContextClockLabel}`}</span>
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
                secondsLeft={previewWindowSecondsLeft}
                tier={previewWindowTier}
                currentLocked={currentLocked}
                poolState={livePoolState}
              />
              <LiveStage
                currentPick={currentPick}
                currentTeam={currentTeam}
                activeTeamCode={currentTeamCode}
                currentStatus={effectiveCurrentStatus}
                currentLocked={currentLocked}
                currentSelection={currentSelection}
                suggestedProspect={null}
                countdownLabel={stageCountdownLabel}
                countdownPrefix={stageCountdownPrefix}
                actualPick={actualCurrentPick}
                poolState={livePoolState}
                boardIds={bigBoardIds}
                prospects={prospects}
                draftedIds={draftedIds}
                mappedPickByProspectId={mappedPredictionContextByProspectId}
                onLockIn={(prospectId) => (isPreviewMode ? handlePreviewLockIn(currentPickNumber, prospectId) : submitLiveCard(currentPickNumber, prospectId))}
                onChangePick={() => (isPreviewMode ? handlePreviewReset(currentPickNumber) : resetLiveCard(currentPickNumber))}
                nextPickLabel={nextPickLabel}
                onNextPick={() => {}}
                scoringConfig={scoringConfig}
                activeWatchlistIds={currentWatchlistIds}
                onAddToWatchlist={(teamCode, prospectId) => (isPreviewMode ? Promise.resolve() : addToWatchlist(teamCode, prospectId))}
                onRemoveFromWatchlist={(teamCode, prospectId) => (isPreviewMode ? Promise.resolve() : removeFromWatchlist(teamCode, prospectId))}
              />
            </div>

            {/* ── Right: pick status then standings ── */}
            <div className="dn-right">
              {!(effectiveCurrentStatus === "awaiting_reveal" || effectiveCurrentStatus === "revealed") ? (
                <>
                  {/* Pool pick status — top, most urgent info */}
                  <div className="dn-right-section">
                    <div className="dn-rs-label">
                      Pick {currentPickNumber} · Pool
                      <span className="dn-pool-count-badge">
                        {livePoolState.filter((m) => m.isCurrentUser ? currentLocked : m.locked).length}/{livePoolState.length} locked
                      </span>
                    </div>
                    {livePoolState.map((m) => {
                      const isLocked = m.isCurrentUser ? currentLocked : m.locked;
                      const isWarning = !isLocked && previewWindowSecondsLeft != null && previewWindowSecondsLeft <= 20 && previewWindowSecondsLeft > 0;
                      const avatarCls = isLocked ? "submitted" : isWarning ? "warning" : "deciding";
                      const initials = (m.name ?? "?").slice(0, 2).toUpperCase();
                      const statusCls = isLocked ? "locked" : isWarning ? "warning" : "deciding";
                      const statusText = isLocked ? "locked ✓" : isWarning ? "hurry up!" : "deciding…";
                      return (
                        <div key={m.id ?? m.name} className="dn-pool-member-row">
                          <div className={`dn-pool-avatar ${avatarCls}${!isLocked ? " pulsing" : ""}`}>
                            {initials}
                          </div>
                          <div className="dn-pool-member-info">
                            <span className={`dn-pool-member-name${m.isCurrentUser ? " me" : ""}`}>
                              {m.isCurrentUser ? "you" : (m.name ?? "—")}
                            </span>
                            <span className={`dn-pool-member-status ${statusCls}`}>
                              {statusText}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {/* Pool pick status — top, most urgent info */}
              {shouldShowNextUp ? (
                <div className="dn-right-section">
                  <div className="dn-rs-label">Next Up</div>
                  <div className="dn-nextup-card">
                    <div className="dn-nextup-kicker">Pick {nextPick.number}</div>
                    <div className="dn-nextup-team-row">
                      <div className="dn-nextup-team">{nextTeam?.name ?? "—"}</div>
                      {nextContextClockLabel ? <div className="dn-nextup-clock">{nextContextClockLabel}</div> : null}
                    </div>
                    {nextTeam?.needs?.length ? (
                      <div className="dn-nextup-needs">
                        {nextTeam.needs.map((need) => (
                          <span key={need} className="dn-nextup-need">{need}</span>
                        ))}
                      </div>
                    ) : null}

                    {nextLocked ? (
                      <>
                        <div className="dn-nextup-selection-label">Your next card</div>
                        <div className="dn-nextup-selection-name">{nextSelection?.name ?? "Locked"}</div>
                        <div className="dn-nextup-selection-meta">
                          {nextSelection ? `${nextSelection.position} · ${nextSelection.school}` : "Saved for the next pick"}
                        </div>
                        <button className="dn-nextup-action" type="button" onClick={() => (isPreviewMode ? handlePreviewReset(nextPick.number) : resetLiveCard(nextPick.number))}>
                          Change next pick
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="dn-nextup-selection-label">
                          {nextPickAllowsSlotContext ? "Predicted, watchlist, then board" : "Trade mode: watchlist first"}
                        </div>
                        <div className="dn-nextup-list">
                          {nextUpRows.map((prospect) => {
                            const isPredicted = nextPickAllowsSlotContext && livePredictions[nextPick.number] === prospect.id;
                            const isWatch = nextWatchlistIds.includes(prospect.id);
                            return (
                              <button
                                key={prospect.id}
                                type="button"
                                className="dn-nextup-row"
                                onClick={() => (isPreviewMode ? handlePreviewLockIn(nextPick.number, prospect.id) : submitLiveCard(nextPick.number, prospect.id))}
                              >
                                <div className="dn-nextup-row-main">
                                  <span className="dn-nextup-row-name">{prospect.name}</span>
                                  <span className="dn-nextup-row-meta">{prospect.position} · {prospect.school}</span>
                                </div>
                                <div className="dn-nextup-row-tags">
                                  {isPredicted ? <span className="dn-nextup-tag predicted">P</span> : null}
                                  {isWatch ? <span className="dn-nextup-tag watch">W</span> : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Standings */}
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
                        <span className={`dn-st-name ${isMe ? "me" : ""}`}>{player.name ?? "—"}</span>
                        <span className={`dn-st-pts ${isMe ? "me" : ""}`}>{player.points}pt</span>
                      </motion.div>
                    );
                  })}
                </LayoutGroup>
              </div>

              <div style={{ padding: "0 14px" }}>
                <div style={{ fontSize: 12, color: "var(--dn-muted)" }}>
                  {members.length} member{members.length !== 1 ? "s" : ""}
                </div>
                <button
                  type="button"
                  style={{ marginTop: 4, fontSize: 11, color: "var(--dn-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
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

import { useEffect, useMemo, useRef, useState } from "react";
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
import { usePoolChat } from "../hooks/usePoolChat";
import { clampDraftPickNumber, getDraftPickRange } from "../lib/draftRange";

const MOBILE_POSITION_OPTIONS = ["ALL", "QB", "WR", "OT", "EDGE", "CB", "DT", "RB", "LB", "S", "TE", "WATCHLIST"];

export default function LiveDraftView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, session } = useAuth();
  const isAdmin = Boolean(profile?.is_admin);
  const { pool, members } = usePool();
  const { draftFeed, teamCodeForPick, advanceDraft } = useDraftFeed();
  const advanceDraftRef = useRef(advanceDraft);
  useEffect(() => { advanceDraftRef.current = advanceDraft; }, [advanceDraft]);
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
  const { messages: chatMessages, loading: chatLoading, sendMessage } = usePoolChat();
  const countdown = useCountdown();
  const { start: firstPickNumber } = getDraftPickRange(picks);

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
  const [hideTaken, setHideTaken] = useState(true);
  const [planningPickNumber, setPlanningPickNumber] = useState(null);
  const [chatDraft, setChatDraft] = useState("");

  const effectivePhase = isAdmin && devPhase ? devPhase : draftFeed.phase;
  const isPreDraft = effectivePhase === "pre_draft";
  const isPreviewMode = searchParams.get("preview") === "1";
  const previewStatus = searchParams.get("status") ?? draftFeed.current_status;
  const previewPickNumber = clampDraftPickNumber(searchParams.get("pick") ?? draftFeed.current_pick_number, picks);

  const currentPickNumber = isPreviewMode
    ? previewPickNumber
    : clampDraftPickNumber(draftFeed.current_pick_number, picks);

  // When the live draft advances to a new pick, snap the left column focus
  useEffect(() => {
    if (draftFeed.phase === "live" && draftFeed.current_pick_number) {
      setSelectedPick(draftFeed.current_pick_number);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFeed.current_pick_number, draftFeed.phase]);

  useEffect(() => {
    if (!picks.length) return;
    if (!picks.some((pick) => pick.number === selectedPick)) {
      setSelectedPick(firstPickNumber);
    }
  }, [firstPickNumber, picks, selectedPick]);

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
    return new Set(Object.values(actualMap));
  }, [draftFeed.actual_picks, isPreviewMode, previewReveals]);

  const currentPick = picks.find((p) => p.number === currentPickNumber) ?? picks[0] ?? { number: firstPickNumber, currentTeam: "" };
  const currentTeam = teams[teamForPick(currentPick)] ?? {};
  const userId = session?.user?.id ?? profile?.id ?? null;
  const currentUserFinalized = userId ? allFinalizedPicks?.[`${userId}:${currentPickNumber}`] ?? null : null;
  const currentPickAllowsSlotContext = teamForPick(currentPick) === currentPick.originalTeam;
  const effectiveCurrentStatus = isPreviewMode ? previewStatus : draftFeed.current_status;
  const canEditCurrentPick = ["on_clock", "pick_is_in"].includes(effectiveCurrentStatus);
  const isCurrentFinalizedPhase = ["awaiting_reveal", "revealed"].includes(effectiveCurrentStatus);
  const currentSubmitted = Boolean(liveCards[currentPickNumber]);
  const currentLocked = isPreviewMode
    ? !canEditCurrentPick && Boolean(previewCards[currentPickNumber])
    : isCurrentFinalizedPhase && Boolean(currentUserFinalized?.prospectId);

  const currentSelectionId = isPreviewMode
    ? previewCards[currentPickNumber] ?? livePredictions[currentPickNumber] ?? null
    : currentLocked
      ? currentUserFinalized?.prospectId ?? null
      : liveCards[currentPickNumber] ?? (currentPickAllowsSlotContext ? livePredictions[currentPickNumber] ?? null : null);
  const currentSelection = getProspectById(currentSelectionId);
  const actualCurrentPick = getProspectById((isPreviewMode ? previewReveals[currentPickNumber] : null) ?? draftFeed.actual_picks?.[currentPickNumber]);

  // Next pick label for the advance button after reveal
  const nextPick = picks.find((p) => p.number === currentPickNumber + 1);
  const nextTeam = nextPick ? teams[teamForPick(nextPick)] : null;
  const nextPickLabel = nextTeam ? `${nextTeam.name} — Pick ${currentPickNumber + 1}` : null;
  const shouldShowNextUp = ["awaiting_reveal", "revealed"].includes(effectiveCurrentStatus) && Boolean(nextPick);
  const futurePlanningPicks = useMemo(() => {
    return picks
      .filter((pick) => pick.number > currentPickNumber && !draftFeed.actual_picks?.[pick.number])
      .slice(0, 8);
  }, [picks, currentPickNumber, draftFeed.actual_picks]);

  const planningPick = useMemo(() => {
    if (!futurePlanningPicks.length) return null;
    return futurePlanningPicks.find((pick) => pick.number === planningPickNumber) ?? futurePlanningPicks[0];
  }, [futurePlanningPicks, planningPickNumber]);

  const planningTeam = planningPick ? teams[teamForPick(planningPick)] : null;
  const planningAllowsSlotContext = planningPick ? teamForPick(planningPick) === planningPick.originalTeam : false;
  const planningSelection = planningPick ? getProspectById(livePredictions[planningPick.number]) : null;

  const nextUpRows = useMemo(() => {
    if (!shouldShowNextUp || !planningPick) return [];

    const predictedId = planningAllowsSlotContext ? livePredictions[planningPick.number] ?? null : null;
    const needs = new Set(planningTeam?.needs ?? []);

    return prospects
      .filter((prospect) => !draftedIds.has(prospect.id))
      .sort((a, b) => {
        const aSelected = planningSelection?.id === a.id ? 1 : 0;
        const bSelected = planningSelection?.id === b.id ? 1 : 0;
        if (aSelected !== bSelected) return bSelected - aSelected;

        const aPredicted = predictedId === a.id ? 1 : 0;
        const bPredicted = predictedId === b.id ? 1 : 0;
        if (aPredicted !== bPredicted) return bPredicted - aPredicted;

        const aNeed = a.position.split("/").some((position) => needs.has(position)) ? 1 : 0;
        const bNeed = b.position.split("/").some((position) => needs.has(position)) ? 1 : 0;
        if (aNeed !== bNeed) return bNeed - aNeed;

        const aRank = bigBoardIds.indexOf(a.id);
        const bRank = bigBoardIds.indexOf(b.id);
        return (aRank === -1 ? 9999 : aRank) - (bRank === -1 ? 9999 : bRank);
      });
  }, [shouldShowNextUp, planningPick, planningTeam?.needs, planningAllowsSlotContext, livePredictions, planningSelection?.id, prospects, draftedIds, bigBoardIds]);

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

  const takenByPosition = useMemo(() => {
    const counts = new Map();
    Object.values(draftFeed.actual_picks ?? {}).forEach((prospectId) => {
      const prospect = getProspectById(prospectId);
      if (!prospect?.position) return;
      String(prospect.position).split("/").forEach((position) => {
        const key = position.trim();
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [draftFeed.actual_picks, getProspectById]);

  const currentTeamPreviousPicks = useMemo(() => {
    const teamCode = currentTeamCode;
    if (!teamCode) return [];
    return picks
      .filter((pick) => pick.number < currentPickNumber && teamForPick(pick) === teamCode)
      .map((pick) => ({
        pickNumber: pick.number,
        prospect: getProspectById(draftFeed.actual_picks?.[pick.number]),
      }))
      .filter((item) => item.prospect);
  }, [picks, currentPickNumber, currentTeamCode, draftFeed.actual_picks, getProspectById]);

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

  const meId = userId;
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
          : currentSubmitted
            ? "Pick submitted"
          : "Awaiting pick";

  // ── Pool state for LiveStage ───────────────────────────────────────────────

  const { secondsLeft: windowSecondsLeft, tier: windowTier } = useSubmitWindow({
    draftFeed,
    currentSubmitted,
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
      void advanceDraftRef.current();
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [effectiveCurrentStatus, isPreviewMode, nextPick?.number]);

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
    const clamped = clampDraftPickNumber(pickNumber, picks);
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

  async function handleFuturePrediction(pickNumber, prospectId) {
    if (draftedIds.has(prospectId)) return;
    if (isPreviewMode) {
      handlePreviewLockIn(pickNumber, prospectId);
      return;
    }
    await saveLivePrediction(pickNumber, prospectId);
  }

  async function handleSendChat(event) {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body) return;
    setChatDraft("");
    const { error } = await sendMessage(body);
    if (error) setChatDraft(body);
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
              hideTaken={hideTaken}
              onToggleHideTaken={() => setHideTaken((value) => !value)}
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
                              <span style={{ marginLeft: 6, fontSize: 10, color: "var(--dn-muted, #c5cad2)" }}>
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
                  liveStandings={[]}
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
                  hideTaken={hideTaken}
                  onToggleHideTaken={() => setHideTaken((value) => !value)}
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
                      liveStandings={[]}
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
                      hideTaken={hideTaken}
                      onToggleHideTaken={() => setHideTaken((value) => !value)}
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
          hideTaken={hideTaken}
          onToggleHideTaken={() => setHideTaken((value) => !value)}
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
                  {effectiveCurrentStatus === "pick_is_in"
                    ? "Locks in"
                    : effectiveCurrentStatus === "awaiting_reveal"
                      ? "Awaiting reveal"
                      : effectiveCurrentStatus === "revealed"
                        ? "Revealed"
                        : "On the clock"}
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
                  currentSubmitted={currentSubmitted}
                  currentSelection={currentSelection}
                  suggestedProspect={null}
                  countdownLabel={stageCountdownLabel}
                  countdownPrefix={stageCountdownPrefix}
                  actualPick={actualCurrentPick}
                  poolState={livePoolState}
                  liveStandings={liveStandings}
                  boardIds={bigBoardIds}
                  prospects={prospects}
                  draftedIds={draftedIds}
                  mappedPickByProspectId={mappedPredictionContextByProspectId}
                  onLockIn={(prospectId) => (isPreviewMode ? handlePreviewLockIn(currentPickNumber, prospectId) : submitLiveCard(currentPickNumber, prospectId))}
                  onChangePick={() => (isPreviewMode ? handlePreviewReset(currentPickNumber) : resetLiveCard(currentPickNumber))}
                  nextPickLabel={null}
                  onNextPick={() => { if (!isPreviewMode) void advanceDraft(); }}
                  scoringConfig={scoringConfig}
                  activeWatchlistIds={currentWatchlistIds}
                  onAddToWatchlist={() => Promise.resolve()}
                  onRemoveFromWatchlist={() => Promise.resolve()}
                  hideTaken={hideTaken}
                  onToggleHideTaken={() => setHideTaken((value) => !value)}
                  previousTeamPicks={currentTeamPreviousPicks}
                />
              </div>
            )}
          </div>

          <div className="mobile-live-pooldots">
            {livePoolState.map((member) => {
              const isDone = isCurrentFinalizedPhase
                ? (member.isCurrentUser ? currentLocked : member.locked)
                : (member.isCurrentUser ? currentSubmitted : member.submitted);
              const isWarning = !isDone && previewWindowSecondsLeft != null && previewWindowSecondsLeft <= 20 && previewWindowSecondsLeft > 0;
              const cls = isDone ? "locked" : isWarning ? "warning" : "waiting";
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
            {draftFeed.team_overrides?.[currentPickNumber] ? (
              <span className="dn-trade-banner">Trade: {currentTeam?.name ?? "New team"} now selecting</span>
            ) : null}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "var(--dn-muted)" }}>
              {isCurrentFinalizedPhase
                ? `${livePoolState.filter((m) => (m.isCurrentUser ? currentLocked : m.locked)).length}/${livePoolState.length} locked`
                : `${livePoolState.filter((m) => (m.isCurrentUser ? currentSubmitted : m.submitted)).length}/${livePoolState.length} submitted`}
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
	                    const isFuture = pick.number > currentPickNumber && !actualProspect;
	                    const isPlanning = planningPick?.number === pick.number;
	                    const isTraded = Boolean(draftFeed.team_overrides?.[pick.number]);
	                    const showNextClock = effectiveCurrentStatus !== "on_clock" && nextPick && pick.number === nextPick.number && nextContextClockLabel;
	                    return (
	                      <div
	                        key={pick.number}
	                        className={`dn-pick-row ${rowClass} ${isPlanning ? "planning" : ""} ${isTraded ? "traded" : ""}`}
	                        onClick={() => {
	                          if (!isCurrent) setSelectedPick(pick.number);
	                          if (isFuture) setPlanningPickNumber(pick.number);
	                        }}
	                        style={{ cursor: isCurrent ? "default" : "pointer" }}
	                      >
	                        <span className="dn-pr-num">{pick.number}</span>
	                        <div className="dn-pr-body">
	                          <span className="dn-pr-team">
	                            {teamName}
	                            {isTraded ? <span className="dn-trade-mini">trade</span> : null}
	                          </span>
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
	                        {isFuture ? (
	                          <button
	                            type="button"
	                            className="dn-future-btn"
	                            onClick={(event) => {
	                              event.stopPropagation();
	                              setPlanningPickNumber(pick.number);
	                            }}
	                          >
	                            {predictedProspect ? "Edit" : "Pick"}
	                          </button>
	                        ) : null}
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
                currentSubmitted={currentSubmitted}
                poolState={livePoolState}
              />
              <LiveStage
                currentPick={currentPick}
                currentTeam={currentTeam}
                activeTeamCode={currentTeamCode}
                currentStatus={effectiveCurrentStatus}
                currentLocked={currentLocked}
                currentSubmitted={currentSubmitted}
                currentSelection={currentSelection}
                suggestedProspect={null}
                countdownLabel={stageCountdownLabel}
                countdownPrefix={stageCountdownPrefix}
                actualPick={actualCurrentPick}
                poolState={livePoolState}
                liveStandings={liveStandings}
                boardIds={bigBoardIds}
                prospects={prospects}
                draftedIds={draftedIds}
                mappedPickByProspectId={mappedPredictionContextByProspectId}
                onLockIn={(prospectId) => (isPreviewMode ? handlePreviewLockIn(currentPickNumber, prospectId) : submitLiveCard(currentPickNumber, prospectId))}
                onChangePick={() => (isPreviewMode ? handlePreviewReset(currentPickNumber) : resetLiveCard(currentPickNumber))}
                nextPickLabel={nextPickLabel}
                onNextPick={() => { if (!isPreviewMode) void advanceDraft(); }}
                scoringConfig={scoringConfig}
                activeWatchlistIds={currentWatchlistIds}
                onAddToWatchlist={(teamCode, prospectId) => (isPreviewMode ? Promise.resolve() : addToWatchlist(teamCode, prospectId))}
                onRemoveFromWatchlist={(teamCode, prospectId) => (isPreviewMode ? Promise.resolve() : removeFromWatchlist(teamCode, prospectId))}
                hideTaken={hideTaken}
                onToggleHideTaken={() => setHideTaken((value) => !value)}
                previousTeamPicks={currentTeamPreviousPicks}
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
                        {livePoolState.filter((m) => m.isCurrentUser ? currentSubmitted : m.submitted).length}/{livePoolState.length} submitted
                      </span>
                    </div>
                    {livePoolState.map((m) => {
                      const isSubmitted = m.isCurrentUser ? currentSubmitted : m.submitted;
                      const isWarning = !isSubmitted && previewWindowSecondsLeft != null && previewWindowSecondsLeft <= 20 && previewWindowSecondsLeft > 0;
                      const avatarCls = isSubmitted ? "submitted" : isWarning ? "warning" : "deciding";
                      const initials = (m.name ?? "?").slice(0, 2).toUpperCase();
                      const statusCls = isSubmitted ? "submitted" : isWarning ? "warning" : "deciding";
                      const statusText = isSubmitted ? "submitted" : isWarning ? "hurry up!" : "deciding…";
                      return (
                        <div key={m.id ?? m.name} className="dn-pool-member-row">
                          <div className={`dn-pool-avatar ${avatarCls}${!isSubmitted ? " pulsing" : ""}`}>
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
	                  <div className="dn-rs-label">Future Picks</div>
	                  <div className="dn-nextup-card">
	                    <div className="dn-future-tabs">
	                      {futurePlanningPicks.map((pick) => (
	                        <button
	                          key={pick.number}
	                          type="button"
	                          className={`dn-future-tab ${planningPick?.number === pick.number ? "active" : ""}`}
	                          onClick={() => setPlanningPickNumber(pick.number)}
	                        >
	                          {pick.number}
	                        </button>
	                      ))}
	                    </div>
	                    <div className="dn-nextup-kicker">Pick {planningPick?.number}</div>
	                    <div className="dn-nextup-team-row">
	                      <div className="dn-nextup-team">{planningTeam?.name ?? "—"}</div>
	                      {planningPick?.number === nextPick?.number && nextContextClockLabel ? <div className="dn-nextup-clock">{nextContextClockLabel}</div> : null}
	                    </div>
	                    {planningTeam?.needs?.length ? (
	                      <div className="dn-nextup-needs">
	                        {planningTeam.needs.map((need) => (
	                          <span key={need} className="dn-nextup-need">{need}</span>
	                        ))}
	                      </div>
	                    ) : null}

	                    {planningSelection ? (
	                      <>
	                        <div className="dn-nextup-selection-label">Saved future pick</div>
	                        <div className="dn-nextup-selection-name">{planningSelection?.name ?? "Saved"}</div>
	                        <div className="dn-nextup-selection-meta">
	                          {planningSelection ? `${planningSelection.position} · ${planningSelection.school}` : "Saved for this pick"}
	                        </div>
	                        <button
	                          className="dn-nextup-action"
	                          type="button"
	                          onClick={() => planningPick && (isPreviewMode ? handlePreviewReset(planningPick.number) : saveLivePrediction(planningPick.number, null))}
	                        >
	                          Clear saved pick
	                        </button>
	                      </>
	                    ) : (
	                      <>
	                        <div className="dn-nextup-selection-label">
	                          {planningAllowsSlotContext ? "Pre-select from available players" : "Trade mode: Big Board fallback"}
	                        </div>
	                        <div className="dn-nextup-list">
	                          {nextUpRows.map((prospect) => {
	                            const isPredicted = planningAllowsSlotContext && livePredictions[planningPick.number] === prospect.id;
	                            return (
	                              <button
	                                key={prospect.id}
	                                type="button"
	                                className="dn-nextup-row"
	                                onClick={() => planningPick && handleFuturePrediction(planningPick.number, prospect.id)}
	                              >
                                <div className="dn-nextup-row-main">
                                  <span className="dn-nextup-row-name">{prospect.name}</span>
                                  <span className="dn-nextup-row-meta">{prospect.position} · {prospect.school}</span>
                                </div>
	                                <div className="dn-nextup-row-tags">
	                                  {isPredicted ? <span className="dn-nextup-tag predicted">P</span> : null}
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
                    const isMe = player.id === meId;
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

	              {takenByPosition.length ? (
	                <div className="dn-right-section">
	                  <div className="dn-rs-label">Taken By Position</div>
	                  <div className="dn-position-counts">
	                    {takenByPosition.map(([position, count]) => (
	                      <div key={position} className="dn-position-count">
	                        <span>{position}</span>
	                        <strong>{count}</strong>
	                      </div>
	                    ))}
	                  </div>
	                </div>
	              ) : null}

	              <div className="dn-right-section">
	                <div className="dn-rs-label">Pool Chat</div>
	                <div className="dn-chat-box">
	                  <div className="dn-chat-messages">
	                    {chatLoading ? (
	                      <div className="dn-chat-empty">Loading chat</div>
	                    ) : chatMessages.length ? (
	                      chatMessages.slice(-8).map((message) => (
	                        <div key={message.id} className={`dn-chat-message ${message.isCurrentUser ? "me" : ""}`}>
	                          <div className="dn-chat-author">{message.isCurrentUser ? "You" : message.authorName}</div>
	                          <div className="dn-chat-body">{message.body}</div>
	                        </div>
	                      ))
	                    ) : (
	                      <div className="dn-chat-empty">No messages yet</div>
	                    )}
	                  </div>
	                  <form className="dn-chat-form" onSubmit={handleSendChat}>
	                    <input
	                      value={chatDraft}
	                      onChange={(event) => setChatDraft(event.target.value)}
	                      placeholder="Message pool"
	                      maxLength={500}
	                    />
	                    <button type="submit" disabled={!chatDraft.trim()}>Send</button>
	                  </form>
	                </div>
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

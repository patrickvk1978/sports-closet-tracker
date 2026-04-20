import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGroup, motion } from "framer-motion";
import BigBoardTable from "../components/BigBoardTable";
import LiveStage from "../components/LiveStage";
import ProspectAvatar from "../components/ProspectAvatar";
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

const NAME_SUFFIXES = new Set(["JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"]);
const EXTERNAL_MOCK_SOURCES = [
  { key: "pff_mock_pick", label: "PFF mock" },
  { key: "athletic_mock_pick", label: "Athletic mock" },
  { key: "ringer_mock_pick", label: "Ringer mock" },
];

function formatChipPlayerName(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return "";

  const firstInitial = parts[0]?.[0] ? `${parts[0][0]}.` : "";
  const lastToken = parts[parts.length - 1];
  const hasSuffix = NAME_SUFFIXES.has(lastToken.toUpperCase());
  const lastName = hasSuffix ? parts[parts.length - 2] : lastToken;
  const suffix = hasSuffix ? ` ${lastToken}` : "";

  return lastName ? `${firstInitial} ${lastName}${suffix}`.trim() : name;
}

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
    saveLivePrediction,
    submitLiveCard,
    resetLiveCard,
    liveResultForPick,
    resolveLivePickForUser,
  } = useLiveDraft({ draftFeed, teamCodeForPick });
  const countdown = useCountdown();

  const [selectedPick, setSelectedPick] = useState(1);
  const [liveTab, setLiveTab] = useState("draft");
  const [pdTab, setPdTab] = useState("picks");
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

  const nextUnsetPick = picks.find((p) => !livePredictions[p.number]);
  const nextUnsetTeam = nextUnsetPick ? teams[teamForPick(nextUnsetPick)] : null;
  const focusedPreDraftPick =
    picks.find((p) => p.number === selectedPick) ??
    nextUnsetPick ??
    picks[0] ??
    null;
  const focusedPreDraftTeam = focusedPreDraftPick ? teams[teamForPick(focusedPreDraftPick)] : null;
  const focusedPreDraftPrediction = focusedPreDraftPick
    ? getProspectById(livePredictions[focusedPreDraftPick.number])
    : null;
  const isFocusedPickUnset = Boolean(focusedPreDraftPick && !livePredictions[focusedPreDraftPick.number]);

  const nextUnsetSuggestions = useMemo(() => {
    if (!focusedPreDraftPick || !focusedPreDraftTeam) return [];
    const teamNeeds = new Set(focusedPreDraftTeam.needs ?? []);
    const usedIds = new Set(Object.values(livePredictions));
    if (focusedPreDraftPrediction?.id) {
      usedIds.delete(focusedPreDraftPrediction.id);
    }
    const availableBoardProspects = bigBoardIds
      .filter((id) => !draftedIds.has(id) && !usedIds.has(id))
      .map((id) => getProspectById(id))
      .filter(Boolean);

    const bestBoardProspect =
      [...availableBoardProspects].sort((a, b) => {
        const aMatch = a.position.split("/").some((pos) => teamNeeds.has(pos));
        const bMatch = b.position.split("/").some((pos) => teamNeeds.has(pos));
        return bMatch - aMatch;
      })[0] ?? null;

    const externalSuggestions = [];

    for (const source of EXTERNAL_MOCK_SOURCES) {
      const mockProspect = prospects.find(
        (prospect) =>
          prospect[source.key] === focusedPreDraftPick.number &&
          !draftedIds.has(prospect.id) &&
          !usedIds.has(prospect.id)
      );

      if (mockProspect) {
        externalSuggestions.push({
          prospect: mockProspect,
          sourceLabel: source.label,
        });
      }

      if (externalSuggestions.length === 2) break;
    }

    return [
      ...(bestBoardProspect
        ? [{
            prospect: bestBoardProspect,
            sourceLabel: bestBoardProspect.position
              .split("/")
              .some((pos) => teamNeeds.has(pos))
              ? "Best fit from your board"
              : "Best available from your board",
          }]
        : []),
      ...externalSuggestions,
    ];
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
        <div className="predraft-v2">

          {/* Compact status bar: progress + countdown, single row */}
          <div className="pd-status-bar">
            <span className="pd-status-count">
              {filledCount === totalPicks
                ? "All 32 picks queued ✓"
                : <><strong>{filledCount}</strong> of {totalPicks} picks set</>}
            </span>
            <div className="pd-status-track">
              <div className="pd-status-fill" style={{ width: `${filledPct}%` }} />
            </div>
            {!countdown.expired && (
              <div className="pd-status-countdown">⏱ Draft in {countdown.label}</div>
            )}
          </div>

          {/* Tabs: My Picks / Big Board */}
          <div className="pd-tabs">
            <button
              className={`pd-tab ${pdTab === "picks" ? "active" : ""}`}
              type="button"
              onClick={() => setPdTab("picks")}
            >
              My Picks
            </button>
            <button
              className={`pd-tab ${pdTab === "board" ? "active" : ""}`}
              type="button"
              onClick={() => setPdTab("board")}
            >
              Big Board
            </button>
          </div>

          {/* ── My Picks tab ── */}
          {pdTab === "picks" && (
            <>
              {/* Next Unset Pick feature card */}
              {focusedPreDraftPick && (
                <div className="next-pick-featured">
                  <div className="npf-num">{focusedPreDraftPick.number}</div>

                  <div className="npf-team-block">
                    <div className="npf-sub">{isFocusedPickUnset ? "Next unset pick" : "Selected pick"}</div>
                    <div className="npf-team">{focusedPreDraftTeam?.name ?? "—"}</div>
                    {focusedPreDraftTeam?.needs?.length ? (
                      <div className="npf-needs">
                        Needs {focusedPreDraftTeam.needs.join(" · ")}
                      </div>
                    ) : null}
                    {focusedPreDraftPrediction ? (
                      <div className="npf-current-pick">
                        <ProspectAvatar
                          prospect={focusedPreDraftPrediction}
                          size="md"
                          className="npf-current-avatar"
                        />
                        <div className="npf-current-copy">
                          <span className="npf-current-label">Current pick</span>
                          <strong>{focusedPreDraftPrediction.name}</strong>
                          <span className="npf-current-meta">
                            {focusedPreDraftPrediction.position} · {focusedPreDraftPrediction.school}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="npf-right">
                    <div className="npf-head">
                      <div className="npf-label">Suggested options</div>
                      <button
                        className="npf-browse-link"
                        type="button"
                        onClick={() => setPdTab("board")}
                      >
                        Browse all →
                      </button>
                    </div>
                    <div className="npf-suggest">
                      {nextUnsetSuggestions.map(({ prospect, sourceLabel }, index) => (
                        <div key={`${sourceLabel}-${prospect.id}`} className={`suggest-card featured ${index > 0 ? "mocked" : "board"}`}>
                          <div className="sc-source">{sourceLabel}</div>
                          <div className="sc-player-row">
                            <ProspectAvatar prospect={prospect} size="sm" className="sc-avatar" />
                            <div className="sc-player-copy">
                              <div className="sc-name">{prospect.name}</div>
                              <div className="sc-pos">{prospect.position} · {prospect.school}</div>
                            </div>
                          </div>
                          {index === 0 ? (
                            <div className="sc-rank">#{bigBoardIds.indexOf(prospect.id) + 1} on your board</div>
                          ) : (
                            <div className="sc-rank">Mocked to Pick {focusedPreDraftPick.number}</div>
                          )}
                          <button
                            className="suggest-use-btn"
                            type="button"
                            onClick={() => saveLivePrediction(focusedPreDraftPick.number, prospect.id)}
                          >
                            Use for Pick {focusedPreDraftPick.number}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 32-pick chip grid */}
              <div className="pd-grid-label">All 32 picks — click any to set or change</div>
              <div className="picks-grid">
                {picks.map((pick) => {
                  const prediction = getProspectById(livePredictions[pick.number]);
                  const team = teams[teamForPick(pick)];
                  const teamName = team?.name ?? `Pick ${pick.number}`;
                  // Abbreviate team name to first word (Raiders, Jets, Browns…)
                  const teamAbbr = teamName.split(" ").slice(-1)[0];
                  const isFilled = Boolean(prediction);
                  const isActive = selectedPick === pick.number;
                  const playerAbbr = prediction ? formatChipPlayerName(prediction.name) : null;
                  return (
                    <div
                      key={pick.number}
                      className={`pick-chip-wrap ${isFilled ? "filled" : "empty"} ${isActive ? "active" : ""}`}
                    >
                      {isFilled ? (
                        <button
                          className="pick-chip-clear"
                          type="button"
                          aria-label={`Clear pick ${pick.number}`}
                          title={`Clear pick ${pick.number}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            saveLivePrediction(pick.number, null);
                            if (selectedPick === pick.number) {
                              setSelectedPick(pick.number);
                            }
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                      <button
                        className={`pick-chip ${isFilled ? "filled" : "empty"} ${isActive ? "active" : ""}`}
                        type="button"
                        title={isFilled ? `${prediction.name} → ${teamName}` : teamName}
                        onClick={() => {
                          setSelectedPick(pick.number);
                        }}
                      >
                        <span className="pc-num">{pick.number}</span>
                        {isFilled ? (
                          <>
                            <span className="pc-player">{playerAbbr}</span>
                            <span className="pc-meta">{prediction.position}</span>
                            <span className="pc-team">{teamAbbr}</span>
                          </>
                        ) : (
                          <span className="pc-team">{teamAbbr}</span>
                        )}
                        {isActive && <span className="pc-editing">editing</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Big Board tab ── */}
          {pdTab === "board" && (
            <>
              <div className="pd-board-ctx">
                <span className="pd-board-ctx-label">Assigning for</span>
                <strong>{getPickLabel(selectedPick)}</strong>
                {(() => {
                  const selPick = picks.find((p) => p.number === selectedPick);
                  const selTeam = selPick ? teams[teamForPick(selPick)]?.name : null;
                  return selTeam ? <span className="pd-board-ctx-team">· {selTeam}</span> : null;
                })()}
                <button
                  className="pd-board-ctx-back"
                  type="button"
                  onClick={() => setPdTab("picks")}
                >
                  ← All picks
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
                  saveLivePrediction(selectedPick, prospectId);
                  setPdTab("picks");
                }}
              />
            </>
          )}
        </div>
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

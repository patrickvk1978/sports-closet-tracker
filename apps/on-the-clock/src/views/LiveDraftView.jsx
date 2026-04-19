import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BigBoardTable from "../components/BigBoardTable";
import LiveStage from "../components/LiveStage";
import { SkeletonPanel } from "../components/Skeleton";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { useCountdown } from "../hooks/useCountdown";
import { useDraftFeed } from "../hooks/useDraftFeed";
import { useBigBoard } from "../hooks/useBigBoard";
import { useLiveDraft } from "../hooks/useLiveDraft";
import { useReferenceData } from "../hooks/useReferenceData";

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

  const nextUnsetSuggestions = useMemo(() => {
    if (!nextUnsetPick || !nextUnsetTeam) return [];
    const teamNeeds = new Set(nextUnsetTeam.needs ?? []);
    const usedIds = new Set(Object.values(livePredictions));
    return bigBoardIds
      .filter((id) => !draftedIds.has(id) && !usedIds.has(id))
      .map((id) => getProspectById(id))
      .filter(Boolean)
      .sort((a, b) => {
        const aMatch = a.position.split("/").some((pos) => teamNeeds.has(pos));
        const bMatch = b.position.split("/").some((pos) => teamNeeds.has(pos));
        return bMatch - aMatch;
      })
      .slice(0, 3);
  }, [nextUnsetPick, nextUnsetTeam, bigBoardIds, draftedIds, livePredictions, getProspectById]);

  // ── Pool state for LiveStage ───────────────────────────────────────────────

  const meId = profile?.id;
  const livePoolState = useMemo(() => {
    return currentLivePoolState.map((m) => ({
      ...m,
      isCurrentUser: m.id === meId || m.isCurrentUser,
    }));
  }, [currentLivePoolState, meId]);

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

          {/* Page header */}
          <div className="pd-header">
            <div>
              <div className="pd-eyebrow">Pre-Draft Setup</div>
              <h2 className="pd-title">Set your picks before draft night</h2>
              <p className="pd-subtitle">
                Your Big Board powers auto-submits if you step away. The queue sets specific slot predictions.
              </p>
            </div>
            {!countdown.expired && (
              <div className="pd-countdown-pill">
                ⏱ Draft in {countdown.label}
              </div>
            )}
          </div>

          {/* Progress card */}
          <div className="pd-progress-card">
            <div className="pd-progress-row">
              <span className="pd-progress-title">Setup progress</span>
              <span className="pd-progress-count">
                {filledCount === totalPicks ? "All picks queued ✓" : `${filledCount} of ${totalPicks} picks set`}
              </span>
            </div>
            <div className="pd-progress-wrap">
              <div className="pd-progress-fill" style={{ width: `${filledPct}%` }} />
            </div>
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
              {nextUnsetPick && (
                <div className="next-pick-featured">
                  <div className="npf-num">{nextUnsetPick.number}</div>

                  <div className="npf-team-block">
                    <div className="npf-sub">Next unset pick</div>
                    <div className="npf-team">{nextUnsetTeam?.name ?? "—"}</div>
                    {nextUnsetTeam?.needs?.length ? (
                      <div className="npf-needs">
                        Needs {nextUnsetTeam.needs.join(" · ")}
                      </div>
                    ) : null}
                  </div>

                  <div className="npf-right">
                    <div className="npf-label">Suggestions from your board</div>
                    <div className="npf-suggest">
                      {nextUnsetSuggestions.map((p) => (
                        <div key={p.id} className="suggest-card featured">
                          <div className="sc-name">{p.name}</div>
                          <div className="sc-pos">{p.position} · {p.school}</div>
                          <div className="sc-rank">#{bigBoardIds.indexOf(p.id) + 1} on your board</div>
                          <button
                            className="suggest-use-btn"
                            type="button"
                            onClick={() => saveLivePrediction(nextUnsetPick.number, p.id)}
                          >
                            Use for Pick {nextUnsetPick.number}
                          </button>
                        </div>
                      ))}
                      <div className="suggest-card browse-all" onClick={() => setPdTab("board")} style={{ cursor: "pointer" }}>
                        <div className="sc-name">Browse all</div>
                        <div className="sc-pos">Search the full prospect list →</div>
                      </div>
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
                  const isActive = selectedPick === pick.number && pdTab === "board";
                  // Abbreviated player name: F.Lastname
                  const playerAbbr = prediction
                    ? `${prediction.name.split(" ")[0][0]}.${prediction.name.split(" ").slice(-1)[0]}`
                    : null;
                  return (
                    <button
                      key={pick.number}
                      className={`pick-chip ${isFilled ? "filled" : "empty"} ${isActive ? "active" : ""}`}
                      type="button"
                      title={isFilled ? `${prediction.name} → ${teamName}` : teamName}
                      onClick={() => {
                        setSelectedPick(pick.number);
                        setPdTab("board");
                      }}
                    >
                      <span className="pc-num">{pick.number}</span>
                      {isFilled ? (
                        <>
                          <span className="pc-player">{playerAbbr}</span>
                          <span className="pc-team">{teamAbbr}</span>
                        </>
                      ) : (
                        <span className="pc-team">{teamAbbr}</span>
                      )}
                      {isActive && <span className="pc-editing">editing</span>}
                    </button>
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

            {/* ── Left: pick timeline ── */}
            <div className="dn-left">
              <div className="dn-panel-label">Picks</div>
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

            {/* ── Center: live stage ── */}
            <div className="dn-center">
              <LiveStage
                currentPick={currentPick}
                currentTeam={currentTeam}
                currentStatus={draftFeed.current_status}
                currentLocked={currentLocked}
                currentSelection={currentSelection}
                suggestedProspect={getProspectById(livePredictions[currentPickNumber])}
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
                {liveStandings.map((player, idx) => {
                  const isMe = livePoolState.find((m) => m.isCurrentUser && m.name === player.name);
                  return (
                    <div key={player.id ?? player.name} className="dn-standings-row">
                      <span className={`dn-st-rank ${idx === 0 ? "top" : ""}`}>{idx + 1}</span>
                      <span className={`dn-st-name ${isMe ? "me" : ""}`}>{player.name}</span>
                      <span className={`dn-st-pts ${isMe ? "me" : ""}`}>{player.points}pt</span>
                    </div>
                  );
                })}
              </div>

              <div className="dn-right-section">
                <div className="dn-rs-label">Pick {currentPickNumber} · Pool</div>
                {livePoolState.map((m) => (
                  <div key={m.id ?? m.name} className="dn-activity-item">
                    <div className="dn-ai-event">
                      <em>{m.isCurrentUser ? "you" : m.name}</em>
                      {" — "}
                      {m.locked ? "locked ✓" : "deciding…"}
                    </div>
                  </div>
                ))}
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

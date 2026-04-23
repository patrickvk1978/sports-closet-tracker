import { useEffect, useMemo, useState } from "react";
import ProspectAvatar from "./ProspectAvatar";

const POSITION_OPTIONS = ["ALL", "QB", "WR", "OT", "EDGE", "CB", "DT", "RB", "LB", "S", "TE"];

const BADGE_CONFIG = {
  W: { label: "Watchlist", className: "watch" },
  R: { label: "Ringer", className: "ringer" },
  A: { label: "Athletic", className: "athletic" },
  E: { label: "ESPN", className: "espn" },
  C: { label: "Consensus", className: "consensus" },
};

function boardIndex(boardIds, prospectId) {
  const idx = boardIds.indexOf(prospectId);
  return idx === -1 ? 9999 : idx;
}

export default function LiveStage({
  variant = "live",
  currentPick,
  currentTeam,
  activeTeamCode = null,
  currentStatus,
  currentLocked,
  currentSelection,
  suggestedProspect,
  countdownLabel,
  actualPick,
  poolState,
  boardIds,
  prospects,
  draftedIds,
  onLockIn,
  onChangePick,
  nextPickLabel,
  onNextPick,
  scoringConfig,
  mappedPickByProspectId = {},
  onViewBigBoard,
  activeWatchlistIds = [],
  onAddToWatchlist,
  onRemoveFromWatchlist,
}) {
  const [filterValue, setFilterValue] = useState("ALL");

  const isPredraft = variant === "predraft";
  const isRevealed = currentStatus === "revealed";
  const stage = isPredraft ? "on_clock" : isRevealed ? "reveal" : currentLocked ? "locked" : "on_clock";

  const timerSeconds = (() => {
    if (typeof countdownLabel !== "string") return null;
    const m = countdownLabel.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  })();
  const timerUrgency =
    timerSeconds == null ? "" :
    timerSeconds <= 10 ? "critical" :
    timerSeconds <= 30 ? "warning" : "";

  const sc = scoringConfig ?? {};
  const T1 = sc.tier_1 ?? 100;
  const T2 = sc.tier_2 ?? 120;
  const T3 = sc.tier_3 ?? 150;
  const T4 = sc.tier_4 ?? 180;
  const streakThreshold = sc.streak_threshold ?? 5;
  const streakMult = sc.streak_multiplier ?? 1.5;

  function tierBase(pickNumber) {
    if (pickNumber <= 8) return T1;
    if (pickNumber <= 16) return T2;
    if (pickNumber <= 24) return T3;
    return T4;
  }

  function mappedCopyForProspect(prospectId) {
    const mappedPick = mappedPickByProspectId?.[prospectId];
    if (!mappedPick || mappedPick.endsWith(`Pick ${currentPick?.number}`)) return null;
    return mappedPick.includes(" at ") ? mappedPick.split(" at ").slice(-1)[0] : mappedPick;
  }

  const activePickNumber = currentPick?.number;
  const watchlistIdSet = useMemo(() => new Set(activeWatchlistIds ?? []), [activeWatchlistIds]);
  const filterOptions = useMemo(() => {
    const options = [...POSITION_OPTIONS];
    if (watchlistIdSet.size > 0) options.push("WATCHLIST");
    return options;
  }, [watchlistIdSet]);

  useEffect(() => {
    if (!filterOptions.includes(filterValue)) {
      setFilterValue("ALL");
    }
  }, [filterOptions, filterValue]);

  const tableRows = useMemo(() => {
    const rows = prospects
      .filter((prospect) => !draftedIds.has(prospect.id))
      .filter((prospect) => {
        if (filterValue === "ALL") return true;
        if (filterValue === "WATCHLIST") return watchlistIdSet.has(prospect.id);
        return prospect.position.includes(filterValue);
      })
      .sort((a, b) => boardIndex(boardIds, a.id) - boardIndex(boardIds, b.id))
      .map((prospect) => {
        const rankIndex = boardIndex(boardIds, prospect.id);
        const badges = [];
        if (!isPredraft && watchlistIdSet.has(prospect.id)) badges.push("W");
        if (prospect.ringer_mock_pick === activePickNumber) badges.push("R");
        if (prospect.athletic_mock_pick === activePickNumber) badges.push("A");
        if (prospect.espn_mock_pick === activePickNumber) badges.push("E");
        if (prospect.consensus_mock_pick === activePickNumber) badges.push("C");

        return {
          prospect,
          rank: rankIndex === 9999 ? "—" : rankIndex + 1,
          badges,
          mappedCopy: mappedCopyForProspect(prospect.id),
        };
      });

    return rows;
  }, [prospects, draftedIds, filterValue, watchlistIdSet, boardIds, activePickNumber, mappedPickByProspectId, isPredraft]);

  const explicitSelectionId = currentSelection?.id ?? suggestedProspect?.id ?? null;
  const highlightedProspectId = explicitSelectionId ?? tableRows[0]?.prospect?.id ?? null;

  const meState = poolState.find((m) => m.isCurrentUser);
  const myResult = meState?.result ?? "miss";
  const isHit = myResult === "exact";
  const pickNum = currentPick?.number ?? 1;
  const meStreakBefore = meState?.streakCount ?? 0;
  const streakBonus = meStreakBefore >= streakThreshold;
  const exactPoints = Math.round(tierBase(pickNum) * (streakBonus ? streakMult : 1));
  const resultLabel = isHit ? (streakBonus ? "🔥 exact hit" : "exact hit") : "miss";
  const resultPoints = isHit ? `+${exactPoints}` : "0";

  async function handleWatchToggle(event, prospectId) {
    event.stopPropagation();
    if (!isPredraft || !activeTeamCode || !prospectId) return;
    if (watchlistIdSet.has(prospectId)) {
      await onRemoveFromWatchlist?.(activeTeamCode, prospectId);
      return;
    }
    await onAddToWatchlist?.(activeTeamCode, prospectId);
  }

  function renderBadgeLegend() {
    return (
      <div className={`ls-badge-legend ${isPredraft ? "predraft" : "live"}`}>
        <span className="ls-badge-legend-copy">Mock Draft Selections:</span>
        {["R", "A", "E", "C"].map((badge) => (
          <span key={badge} className="ls-badge-legend-item">
            <span className={`ls-source-badge ${BADGE_CONFIG[badge]?.className ?? ""}`}>{badge}</span>
            <span>{BADGE_CONFIG[badge]?.label ?? badge}</span>
          </span>
        ))}
        <span className="ls-badge-legend-separator" aria-hidden="true">|</span>
        <span className="ls-badge-legend-item">
          <span className={`ls-source-badge ${BADGE_CONFIG.W.className}`}>W</span>
          <span>Your Watchlist</span>
        </span>
      </div>
    );
  }

  function renderHeaderControls(controlVariant) {
    if (stage !== "on_clock") return null;
    const isLiveControls = controlVariant === "live";
    return (
      <>
        <div className={`ls-header-control-row ${isLiveControls ? "live" : "predraft"}`}>
          <div className={`ls-filter-wrap in-header ${isLiveControls ? "live" : ""}`}>
            <select
              className={`ls-filter-select compact ${isLiveControls ? "live" : "predraft"}`}
              value={filterValue}
              onChange={(event) => setFilterValue(event.target.value)}
            >
              <option value="ALL">All</option>
              {filterOptions.filter((value) => value !== "ALL").map((value) => (
                <option key={value} value={value}>
                  {value === "WATCHLIST" ? "Watch" : value}
                </option>
              ))}
            </select>
          </div>
          {!isLiveControls && currentSelection && onChangePick ? (
            <button
              className="ls-clear-btn icon-only"
              type="button"
              onClick={onChangePick}
              aria-label="Clear prediction"
              title="Clear prediction"
            >
              ×
            </button>
          ) : null}
        </div>
        {isLiveControls ? renderBadgeLegend() : null}
      </>
    );
  }

  return (
    <div className={`ls-root ${isPredraft ? "predraft" : "live"}`}>
      <div className={`ls-topbar ${isPredraft ? "predraft" : "live"}`}>
        <div className={`ls-header ${isPredraft ? "predraft" : ""} ${stage === "on_clock" && !isPredraft && timerUrgency === "critical" ? "critical" : ""}`}>
          <div className="ls-team-block">
            <div className="ls-pick-label">
              Pick {currentPick?.number} · {isPredraft ? "Prediction editor" : stage === "locked" ? "Card submitted — waiting on announcement" : "Now Selecting"}
            </div>
            <div className="ls-team-name">{currentTeam?.name ?? "—"}</div>
            {isPredraft && stage === "on_clock" ? renderBadgeLegend() : null}
            {stage !== "locked" && currentTeam?.needs?.length ? (
              <div className="ls-needs">
                {currentTeam.needs.map((n) => <span key={n} className="ls-need-tag">{n}</span>)}
              </div>
            ) : null}
          </div>
          <div className={`ls-timer ${isPredraft ? "predraft" : ""}`}>
            {isPredraft ? (
              <div className="ls-header-actions">
                {onViewBigBoard ? (
                  <button className="board-back-link ls-header-link" type="button" onClick={onViewBigBoard}>
                    View full big board →
                  </button>
                ) : null}
                {renderHeaderControls("predraft")}
              </div>
            ) : stage === "reveal" ? null : (
              <div className="ls-header-actions live">
                <div className="ls-live-header-timer">
                  <span className={`ls-timer-label ${stage === "locked" ? "locked" : timerUrgency}`}>
                    {stage === "locked" ? "Card Locked" : "Submit in"}
                  </span>
                  <span className={`ls-timer-val ${stage === "locked" ? "locked" : timerUrgency}`}>
                    {countdownLabel}
                  </span>
                </div>
                {renderHeaderControls("live")}
              </div>
            )}
          </div>
        </div>
        <div className="ls-divider" />
      </div>

      {stage === "on_clock" && (
        <>
          {tableRows.length > 0 ? (
            <div className={`ls-table-shell ${isPredraft ? "predraft" : "live"}`}>
              <div className="ls-table-head">
                <span>Player</span>
                <span>Position</span>
                <span>Rank</span>
              </div>
              <div className="ls-table-body">
                {tableRows.map(({ prospect, rank, badges, mappedCopy }) => {
                  const isCurrentPick = highlightedProspectId === prospect.id;
                  return (
                    <button
                      key={prospect.id}
                      type="button"
                      className={`ls-player-row ${isPredraft ? "predraft" : "live"} ${isCurrentPick ? "current" : ""}`}
                      style={mappedCopy ? { opacity: 0.55 } : undefined}
                      onClick={() => onLockIn(prospect.id)}
                    >
                      <div className="ls-player-main">
                        <ProspectAvatar prospect={prospect} size="md" className="ls-player-avatar" />
                        <div className="ls-player-copy">
                          <div className="ls-player-name-row">
                            <span className="ls-player-name">{prospect.name}</span>
                            {isPredraft && activeTeamCode ? (
                              <button
                                type="button"
                                className={`ls-watch-toggle ${watchlistIdSet.has(prospect.id) ? "active" : ""}`}
                                aria-label={watchlistIdSet.has(prospect.id) ? `Remove ${prospect.name} from ${currentTeam?.name ?? "team"} watchlist` : `Add ${prospect.name} to ${currentTeam?.name ?? "team"} watchlist`}
                                title={watchlistIdSet.has(prospect.id) ? "Remove from watchlist" : "Add to watchlist"}
                                onClick={(event) => { void handleWatchToggle(event, prospect.id); }}
                              >
                                <span className="ls-watch-toggle-ring" aria-hidden="true">
                                  W
                                </span>
                              </button>
                            ) : null}
                          </div>
                          <div className="ls-player-meta-row">
                            <span className="ls-player-school">
                              {prospect.school}{mappedCopy ? ` · ${mappedCopy}` : ""}
                            </span>
                            {badges.length > 0 ? (
                              <span className="ls-badge-row">
                                {badges.map((badge) => (
                                  <span
                                    key={`${prospect.id}-${badge}`}
                                    className={`ls-source-badge ${BADGE_CONFIG[badge]?.className ?? ""}`}
                                    title={BADGE_CONFIG[badge]?.label ?? badge}
                                  >
                                    {badge}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="ls-player-pos">
                        <span className="ls-player-pos-pill">{prospect.position}</span>
                      </div>
                      <div className="ls-player-rank">{rank}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="ls-search-hint">
              {filterValue === "WATCHLIST"
                ? "No watchlist players for this team yet."
                : "No available prospects match this filter."}
            </div>
          )}
        </>
      )}

      {stage === "locked" && (
        <>
          <div className="ls-locked-card">
            <ProspectAvatar
              prospect={currentSelection ?? suggestedProspect}
              size="lg"
              className="ls-locked-avatar"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ls-locked-badge">SUBMITTED</div>
              <div className="ls-locked-name">{currentSelection?.name ?? suggestedProspect?.name ?? "—"}</div>
              <div className="ls-locked-meta">
                {(currentSelection ?? suggestedProspect)?.position} · {(currentSelection ?? suggestedProspect)?.school}
              </div>
            </div>
          </div>

          <button className="ls-change-btn-secondary" type="button" onClick={onChangePick}>
            ↩ Change pick
          </button>
          <div className="ls-change-hint">Re-opens pick selection · window timer still runs</div>
        </>
      )}

      {stage === "reveal" && (
        <>
          <div className="ls-reveal-announce">
            <ProspectAvatar prospect={actualPick} size="xl" className="ls-reveal-avatar" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ls-reveal-team-label">{currentTeam?.name} select · Pick {currentPick?.number}</div>
              <div className="ls-reveal-player-name">{actualPick?.name ?? "—"}</div>
              <div className="ls-reveal-player-meta">
                {actualPick ? `${actualPick.position} · ${actualPick.school}` : ""}
              </div>
            </div>
            <div className={`ls-result-badge ${isHit ? "hit" : "miss"}`}>
              <div className="ls-result-badge-who">YOU</div>
              <span className="ls-result-badge-pts">{resultPoints}</span>
              <span className="ls-result-badge-label">{resultLabel}</span>
            </div>
          </div>

          <div className="ls-divider" />

          <div className="ls-pool-how-label">How the pool did</div>
          <div className="ls-reveal-pool-grid">
            {poolState.map((m) => {
              const hit = m.result === "exact";
              const mStreak = m.streakCount ?? 0;
              const mMultiplier = mStreak >= streakThreshold ? streakMult : 1;
              const mPts = hit ? `+${Math.round(tierBase(pickNum) * mMultiplier)}` : null;
              const nameLabel = m.isCurrentUser ? `${m.name} · you` : m.name;
              return (
                <div key={m.id ?? m.name} className={`ls-reveal-pool-card ${hit ? "hit" : "miss"}`}>
                  <div className="ls-rpc-header">
                    <div className="ls-rpc-name">{nameLabel}</div>
                    <div className="ls-rpc-result">
                      {hit ? `✓ ${mPts}${mStreak >= 5 ? " 🔥" : ""}` : "miss"}
                    </div>
                  </div>
                  <div className="ls-rpc-player-row">
                    <ProspectAvatar prospect={m.prospect} size="sm" />
                    <div className="ls-rpc-player-body">
                      <div className="ls-rpc-player">{m.prospect?.name ?? "—"}</div>
                      <div className="ls-rpc-meta">
                        {m.prospect ? `${m.prospect.position} · ${m.prospect.school}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {nextPickLabel ? (
            <button className="ls-next-btn" type="button" onClick={onNextPick}>
              {nextPickLabel} →
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

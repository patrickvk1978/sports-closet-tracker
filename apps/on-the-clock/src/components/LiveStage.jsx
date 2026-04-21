/**
 * LiveStage — dark command-center stage for a single live pick.
 *
 * Three states derived from props:
 *   1. on_clock  → suggestions bar (queue + expert picks) + search/filter list
 *   2. locked    → green confirmation card, quiet "change pick" link
 *   3. reveal    → compact announcement + 2×2 pool comparison grid
 */
import { useMemo, useState } from "react";
import ProspectAvatar from "./ProspectAvatar";

const POSITIONS = ["All", "QB", "WR", "OT", "EDGE", "CB", "DT", "RB", "LB", "S", "TE"];

export default function LiveStage({
  variant = "live",    // "live" | "predraft"
  currentPick,          // { number }
  currentTeam,          // { name, needs: string[] }
  currentStatus,        // "on_clock" | "pick_is_in" | "revealed"
  currentLocked,        // bool — true when a live_card row exists
  currentSelection,     // prospect | null — what was locked
  suggestedProspect,    // prospect | null — from user's pre-draft prediction
  suggestedProspectLabel, // string | null — label for primary suggested card
  expertSuggestions,    // [{ label, prospect }] — PFF/Athletic/Ringer picks
  countdownLabel,       // string, e.g. "04:18"
  actualPick,           // prospect | null — official pick once revealed
  poolState,            // [{ id, name, locked, result, prospect, isCurrentUser }]
  boardIds,             // string[] — board order for search ranking
  prospects,            // Prospect[] — full list
  draftedIds,           // Set<string> — already taken prospect IDs
  onLockIn,             // (prospectId) => void — immediate submit
  onChangePick,         // () => void — reset locked card
  nextPickLabel,        // string, e.g. "Jets on the clock — Pick 2 →"
  onNextPick,           // () => void — optional next-pick action
  scoringConfig,        // { tier_1..4, streak_threshold, streak_multiplier }
  mappedPickByProspectId = {}, // { [prospectId]: string }
  onViewBigBoard,       // () => void — optional big board route
  watchlistSuggestions = [], // [{ prospect, label? }] — team-specific watchlist (live view)
  predraftWatchlist = [],    // [prospectId | prospect] — inline strip under pos chips (pre-draft)
  watchlistCapacity = 4,     // max per-team
  onAddToWatchlist,          // (prospectId) => void — pre-draft strip
  onRemoveFromWatchlist,     // (prospectId) => void — pre-draft strip
  allProspects = [],         // Prospect[] — needed to resolve watchlist ids
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("All");
  const [wlPickerOpen, setWlPickerOpen] = useState(false);

  const isPredraft = variant === "predraft";
  const isActualPredraftSelection = isPredraft && suggestedProspectLabel === "Current";
  const isRevealed = currentStatus === "revealed";
  const stage = isPredraft ? "on_clock" : isRevealed ? "reveal" : currentLocked ? "locked" : "on_clock";

  // A4 — parse countdown label for urgency states
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

  const submittedCount = poolState.filter((m) => m.locked).length;
  const totalCount = poolState.length;

  // Search results sorted by board order — shown even with empty query (top 8)
  const searchResults = useMemo(() => {
    const boardIndex = (id) => { const i = boardIds.indexOf(id); return i === -1 ? 9999 : i; };
    return prospects
      .filter((p) => !draftedIds.has(p.id))
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .filter((p) => posFilter === "All" || p.position.includes(posFilter))
      .sort((a, b) => boardIndex(a.id) - boardIndex(b.id))
      .slice(0, 8);
  }, [prospects, draftedIds, boardIds, search, posFilter]);

  function handleLockIn(prospectId) {
    onLockIn(prospectId);
    setSearch("");
    setPosFilter("All");
  }

  function mappedCopyForProspect(prospectId) {
    const mappedPick = mappedPickByProspectId?.[prospectId];
    if (!mappedPick || mappedPick.endsWith(`Pick ${currentPick?.number}`)) return null;
    return `Predicted to ${mappedPick}`;
  }

  // Scoring config with fallbacks
  const sc = scoringConfig ?? {};
  const T1 = sc.tier_1 ?? 100, T2 = sc.tier_2 ?? 120, T3 = sc.tier_3 ?? 150, T4 = sc.tier_4 ?? 180;
  const streakThreshold = sc.streak_threshold ?? 5;
  const streakMult = sc.streak_multiplier ?? 1.5;

  function tierBase(pickNumber) {
    if (pickNumber <= 8)  return T1;
    if (pickNumber <= 16) return T2;
    if (pickNumber <= 24) return T3;
    return T4;
  }

  // Derive my result for the reveal badge
  const meState = poolState.find((m) => m.isCurrentUser);
  const myResult = meState?.result ?? "miss";
  const isHit = myResult === "exact";
  const pickNum = currentPick?.number ?? 1;
  const meStreakBefore = meState?.streakCount ?? 0;
  const streakBonus = meStreakBefore >= streakThreshold;
  const exactPoints = Math.round(tierBase(pickNum) * (streakBonus ? streakMult : 1));
  const resultLabel = isHit ? (streakBonus ? "🔥 exact hit" : "exact hit") : "miss";
  const resultPoints = isHit ? `+${exactPoints}` : "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header: always visible ── */}
      <div className={`ls-header ${isPredraft ? "predraft" : ""} ${stage === "on_clock" && !isPredraft && timerUrgency === "critical" ? "critical" : ""}`}>
        <div className="ls-team-block">
          <div className="ls-pick-label">
            Pick {currentPick?.number} · {isPredraft ? "Prediction editor" : stage === "locked" ? "Card submitted — waiting on announcement" : "Now Selecting"}
          </div>
          <div className="ls-team-name">{currentTeam?.name ?? "—"}</div>
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
                <button className="ls-header-link" type="button" onClick={onViewBigBoard}>
                  View full big board
                </button>
              ) : null}
              {suggestedProspect && onChangePick ? (
                <button className="ls-clear-btn" type="button" onClick={onChangePick}>
                  Clear prediction
                </button>
              ) : null}
            </div>
          ) : stage === "reveal" ? null : (
            <>
              <span className={`ls-timer-label ${stage === "locked" ? "locked" : timerUrgency}`}>
                {stage === "locked" ? "Card Locked" : "Submit in"}
              </span>
              <span className={`ls-timer-val ${stage === "locked" ? "locked" : timerUrgency}`}>
                {stage === "locked" ? countdownLabel : countdownLabel}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="ls-divider" />

      {/* ══ STATE: on_clock — always show suggestions + search ══ */}
      {stage === "on_clock" && (
        <>
          {/* Suggestions: PREDICTED (full-width) + flexible grid (experts + watchlist) */}
          {(suggestedProspect || (expertSuggestions && expertSuggestions.length > 0) || (watchlistSuggestions && watchlistSuggestions.length > 0)) && (() => {
            // Dedup expert suggestions by prospect id (if two experts agree, merge)
            const dedup = [];
            for (const s of (expertSuggestions ?? [])) {
              if (!s?.prospect) continue;
              const existing = dedup.find(d => d.prospect.id === s.prospect.id);
              if (existing) {
                existing.label = [existing.label, s.label].filter(Boolean).join(" / ");
              } else {
                dedup.push({ label: s.label, prospect: s.prospect });
              }
            }
            const gridItems = [
              ...dedup.map(x => ({ kind: "expert", ...x })),
              ...(watchlistSuggestions ?? [])
                .filter(w => w?.prospect)
                .map(w => ({ kind: "watchlist", label: w.label ?? "Watchlist", prospect: w.prospect })),
            ];
            const colCount = Math.max(1, Math.min(4, gridItems.length || 1));
            return (
              <div className="ls-suggestions-bar">
                {suggestedProspect && (
                  <div className={`ls-suggestion-row queue primary ${isPredraft ? "predraft" : ""}`} style={{ width: "100%" }}>
                    <div className="ls-sug-label">{suggestedProspectLabel ?? (isPredraft ? "Current prediction" : "PREDICTED")}</div>
                    <ProspectAvatar prospect={suggestedProspect} size="sm" />
                    <div className="ls-sug-info">
                      <span className="ls-sug-name">{suggestedProspect.name}</span>
                      <span className="ls-sug-meta">
                        {suggestedProspect.position} · {suggestedProspect.school}
                        {boardIds.indexOf(suggestedProspect.id) !== -1
                          ? ` · #${boardIds.indexOf(suggestedProspect.id) + 1} on board`
                          : ""}
                      </span>
                    </div>
                    <button
                      className="ls-sug-lock"
                      type="button"
                      onClick={() => handleLockIn(suggestedProspect.id)}
                    >
                      {isPredraft ? (isActualPredraftSelection ? "Update →" : "Use →") : "Lock in →"}
                    </button>
                  </div>
                )}
                {gridItems.length > 0 && (
                  <div
                    className="ls-sug-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                      gap: 8,
                      width: "100%",
                    }}
                  >
                    {gridItems.map(({ kind, label, prospect }) =>
                      kind === "watchlist" ? (
                        /* Compact watchlist card — no repeated label, no avatar */
                        <div
                          key={`${kind}-${prospect.id}`}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: 6,
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--dn-muted, #8b95a6)", marginBottom: 4 }}>
                              Watchlist
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--dn-text, #e6ebf2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {prospect.name}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--dn-muted, #8b95a6)", marginTop: 2 }}>
                              {prospect.position} · {prospect.school}
                            </div>
                          </div>
                          <button
                            className="ls-sug-lock"
                            type="button"
                            style={{ alignSelf: "stretch", marginTop: 2 }}
                            onClick={() => handleLockIn(prospect.id)}
                          >
                            {isPredraft ? "Use →" : "Lock in →"}
                          </button>
                        </div>
                      ) : (
                        /* Expert pick card — original layout */
                        <div key={`${kind}-${prospect.id}`} className={`ls-suggestion-row ${kind} ${isPredraft ? "predraft" : ""}`}>
                          <div className="ls-sug-label">{label}</div>
                          <ProspectAvatar prospect={prospect} size="sm" />
                          <div className="ls-sug-info">
                            <span className="ls-sug-name">{prospect.name}</span>
                            <span className="ls-sug-meta">
                              {prospect.position} · {prospect.school}
                              {mappedCopyForProspect(prospect.id) ? ` · ${mappedCopyForProspect(prospect.id)}` : ""}
                            </span>
                          </div>
                          <button
                            className="ls-sug-lock"
                            type="button"
                            onClick={() => handleLockIn(prospect.id)}
                          >
                            {isPredraft ? "Use →" : "Lock in →"}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Search field */}
          <div className="ls-search-wrap">
            <span className="ls-search-ico">🔍</span>
            <input
              className="ls-search-field"
              placeholder="Name or position (e.g. 'Travis' or 'WR')"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Position chips + inline watchlist strip */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <div className="ls-pos-chips" style={{ flex: "1 1 auto", flexWrap: "wrap" }}>
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  className={`ls-pos-chip ${posFilter === pos ? "active" : ""}`}
                  type="button"
                  onClick={() => setPosFilter(pos)}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* Watchlist slots — right side, same row */}
            {isPredraft && onAddToWatchlist && (() => {
              const resolve = (pid) => {
                if (pid && typeof pid === "object") return pid;
                return allProspects.find((p) => p.id === pid) ?? null;
              };
              const wlProspects = (predraftWatchlist ?? []).map(resolve).filter(Boolean);
              const slots = Math.max(0, watchlistCapacity - wlProspects.length);
              const wlIds = new Set(wlProspects.map((p) => p.id));
              const predictedId = suggestedProspect?.id;
              // Picker: top-8 from board order, excluding drafted/already-watchlisted/predicted
              const pickerCandidates = prospects
                .filter((p) => !draftedIds.has(p.id) && !wlIds.has(p.id) && p.id !== predictedId)
                .sort((a, b) => {
                  const ia = boardIds.indexOf(a.id); const ib = boardIds.indexOf(b.id);
                  return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
                })
                .slice(0, 4);
              return (
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, letterSpacing: 0.5, color: "var(--dn-muted, #8b95a6)", textTransform: "uppercase" }}>
                    Watch
                  </span>
                  {wlProspects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onRemoveFromWatchlist && onRemoveFromWatchlist(p.id)}
                      title={`${p.name} — click to remove`}
                      style={{ padding: 0, background: "none", border: "none", cursor: "pointer", lineHeight: 0 }}
                    >
                      <ProspectAvatar prospect={p} size="sm" />
                    </button>
                  ))}
                  {Array.from({ length: slots }).map((_, i) => (
                    <button
                      key={`empty-${i}`}
                      type="button"
                      onClick={() => setWlPickerOpen((v) => !v)}
                      title="Add to watchlist"
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        border: "1px dashed var(--dn-muted, #6b7380)",
                        background: "transparent", color: "var(--dn-muted, #8b95a6)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, cursor: "pointer", padding: 0,
                      }}
                    >
                      +
                    </button>
                  ))}
                  {wlPickerOpen && (
                    <div
                      style={{
                        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20,
                        background: "var(--dn-card, #1b2230)", border: "1px solid var(--dn-border, #2a3341)",
                        borderRadius: 8, padding: 6, minWidth: 260, boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
                      }}
                    >
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--dn-muted, #8b95a6)", padding: "4px 6px 6px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        Add to watchlist
                      </div>
                      {pickerCandidates.map((p) => (
                        <div
                          key={p.id}
                          onClick={async () => {
                            if (onAddToWatchlist) await onAddToWatchlist(p.id);
                            setWlPickerOpen(false);
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                            borderRadius: 6, cursor: "pointer", fontSize: 12,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <ProspectAvatar prospect={p} size="sm" />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: "var(--dn-text, #e6ebf2)", fontWeight: 600 }}>{p.name}</div>
                            <div style={{ color: "var(--dn-muted, #8b95a6)", fontSize: 11 }}>{p.position} · {p.school}</div>
                          </div>
                        </div>
                      ))}
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4, display: "flex", gap: 4 }}>
                        {onViewBigBoard ? (
                          <button
                            type="button"
                            onClick={() => { setWlPickerOpen(false); onViewBigBoard(); }}
                            style={{
                              flex: 1, padding: "7px 8px", fontSize: 11,
                              background: "none", border: "none", color: "var(--dn-accent, #3b82f6)",
                              cursor: "pointer", textAlign: "left",
                            }}
                          >
                            See full board →
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setWlPickerOpen(false)}
                          style={{
                            padding: "7px 8px", fontSize: 11,
                            background: "none", border: "none", color: "var(--dn-muted, #8b95a6)",
                            cursor: "pointer",
                          }}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Results */}
          {searchResults.length > 0 ? (
            <div className="ls-search-results">
              <div className="ls-search-results-label">
                {isPredraft ? "Your board order · click to save and advance" : "Your board order · tap to lock in instantly"}
              </div>
              {searchResults.map((p) => {
                const rank = boardIds.indexOf(p.id) + 1;
                const mappedCopy = mappedCopyForProspect(p.id);
                return (
                  <div key={p.id} className={`ls-sr-row ${isPredraft ? "predraft" : ""}`} onClick={() => handleLockIn(p.id)}>
                    <div className="ls-sr-rank">#{rank > 0 ? rank : "—"}</div>
                    <ProspectAvatar prospect={p} size="sm" />
                    <div className="ls-sr-copy">
                      <div className="ls-sr-name-row">
                        <div className="ls-sr-name">{p.name}</div>
                        {mappedCopy ? <span className="ls-sr-note">{mappedCopy}</span> : null}
                      </div>
                      <div className="ls-sr-meta">{p.position} · {p.school}</div>
                    </div>
                    <div className="ls-sr-select">{isPredraft ? "Use →" : "Lock in →"}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ls-search-hint">
              {search || posFilter !== "All"
                ? "No available prospects match — try a different filter."
                : "All prospects drafted."}
            </div>
          )}
        </>
      )}

      {/* ══ STATE: locked ══ */}
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

      {/* ══ STATE: reveal ══ */}
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

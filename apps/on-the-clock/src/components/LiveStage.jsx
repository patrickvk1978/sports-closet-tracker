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
  currentPick,          // { number }
  currentTeam,          // { name, needs: string[] }
  currentStatus,        // "on_clock" | "pick_is_in" | "revealed"
  currentLocked,        // bool — true when a live_card row exists
  currentSelection,     // prospect | null — what was locked
  suggestedProspect,    // prospect | null — from user's pre-draft prediction
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
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("All");

  const isRevealed = currentStatus === "revealed";
  const stage = isRevealed ? "reveal" : currentLocked ? "locked" : "on_clock";

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

  // Derive my result for the reveal badge
  const meState = poolState.find((m) => m.isCurrentUser);
  const myResult = meState?.result ?? "miss";
  const isHit = myResult === "exact" || myResult === "position";
  const resultLabel = myResult === "exact" ? "exact hit" : myResult === "position" ? "pos hit" : "miss";
  const resultPoints = myResult === "exact" ? "+5" : myResult === "position" ? "+2" : "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header: always visible ── */}
      <div className={`ls-header ${stage === "on_clock" && timerUrgency === "critical" ? "critical" : ""}`}>
        <div className="ls-team-block">
          <div className="ls-pick-label">
            Pick {currentPick?.number} · {stage === "locked" ? "Card submitted — waiting on announcement" : "Now Selecting"}
          </div>
          <div className="ls-team-name">{currentTeam?.name ?? "—"}</div>
          {stage !== "locked" && currentTeam?.needs?.length ? (
            <div className="ls-needs">
              {currentTeam.needs.map((n) => <span key={n} className="ls-need-tag">{n}</span>)}
            </div>
          ) : null}
        </div>
        <div className="ls-timer">
          {stage === "locked" ? (
            <>
              <span className="ls-timer-label locked">Card Locked</span>
              <span className="ls-timer-val locked">✓</span>
            </>
          ) : stage === "reveal" ? null : (
            <>
              <span className={`ls-timer-label ${timerUrgency}`}>Submit in</span>
              <span className={`ls-timer-val ${timerUrgency}`}>{countdownLabel}</span>
            </>
          )}
        </div>
      </div>

      <div className="ls-divider" />

      {/* ══ STATE: on_clock — always show suggestions + search ══ */}
      {stage === "on_clock" && (
        <>
          {/* Suggestions bar: queue pick + expert picks */}
          {(suggestedProspect || (expertSuggestions && expertSuggestions.length > 0)) && (
            <div className="ls-suggestions-bar">
              {suggestedProspect && (
                <div className="ls-suggestion-row queue">
                  <div className="ls-sug-label">Your Queue Pick</div>
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
                    Lock in →
                  </button>
                </div>
              )}
              {(expertSuggestions ?? []).map(({ label, prospect }) => (
                <div key={prospect.id} className="ls-suggestion-row expert">
                  <div className="ls-sug-label">{label}</div>
                  <ProspectAvatar prospect={prospect} size="sm" />
                  <div className="ls-sug-info">
                    <span className="ls-sug-name">{prospect.name}</span>
                    <span className="ls-sug-meta">{prospect.position} · {prospect.school}</span>
                  </div>
                  <button
                    className="ls-sug-lock"
                    type="button"
                    onClick={() => handleLockIn(prospect.id)}
                  >
                    Lock in →
                  </button>
                </div>
              ))}
            </div>
          )}

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

          {/* Position chips */}
          <div className="ls-pos-chips">
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

          {/* Results */}
          {searchResults.length > 0 ? (
            <div className="ls-search-results">
              <div className="ls-search-results-label">Your board order · tap to lock in instantly</div>
              {searchResults.map((p) => {
                const rank = boardIds.indexOf(p.id) + 1;
                return (
                  <div key={p.id} className="ls-sr-row" onClick={() => handleLockIn(p.id)}>
                    <div className="ls-sr-rank">#{rank > 0 ? rank : "—"}</div>
                    <ProspectAvatar prospect={p} size="sm" />
                    <div className="ls-sr-name">{p.name}</div>
                    <div className="ls-sr-pos">{p.position}</div>
                    <div className="ls-sr-school">{p.school}</div>
                    <div className="ls-sr-select">Lock in →</div>
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
            <button className="ls-change-btn" type="button" onClick={onChangePick}>
              change pick
            </button>
          </div>
          <div className="ls-change-hint">Changing will re-open pick selection. Timer still runs.</div>

          {/* Pool status */}
          <div className="ls-pool-pulse">
            <div className="ls-pp-label">
              {submittedCount === totalCount
                ? `All ${totalCount} submitted · Waiting for the pick together`
                : `${submittedCount} of ${totalCount} submitted`}
            </div>
            <div className="ls-pp-members">
              {poolState.map((m) => {
                const initials = m.name.slice(0, 2).toUpperCase();
                const cls = m.isCurrentUser ? "me" : m.locked ? "submitted" : "pending";
                return (
                  <div key={m.id ?? m.name} className="ls-pp-member">
                    <div className={`ls-pp-avatar ${cls}`}>{initials}</div>
                    <div className="ls-pp-name">{m.isCurrentUser ? "you" : m.name}</div>
                    <div className={`ls-pp-status ${m.locked ? "in" : "wait"}`}>{m.locked ? "✓" : "…"}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <button className="ls-lock-btn ghost" type="button" disabled>
            ⏳ Waiting for official announcement…
          </button>
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
              const result = m.result ?? "miss";
              const hit = result === "exact" || result === "position";
              const pts = result === "exact" ? "+5" : result === "position" ? "+2" : null;
              const nameLabel = m.isCurrentUser ? `${m.name} · you` : m.name;
              return (
                <div key={m.id ?? m.name} className={`ls-reveal-pool-card ${hit ? "hit" : "miss"}`}>
                  <div className="ls-rpc-header">
                    <div className="ls-rpc-name">{nameLabel}</div>
                    <div className="ls-rpc-result">{pts ? `✓ ${pts}` : "miss"}</div>
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

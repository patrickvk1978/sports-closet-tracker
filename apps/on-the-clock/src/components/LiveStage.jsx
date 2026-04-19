/**
 * LiveStage — dark command-center stage for a single live pick.
 *
 * Three states derived from props:
 *   1. on_clock  → queue suggestion + "Lock it in →" (immediate submit)
 *                  OR search mode (inline, toggled locally)
 *   2. locked    → green confirmation card, quiet "change pick" link
 *   3. reveal    → compact announcement + 2×2 pool comparison grid
 */
import { useMemo, useState } from "react";

const POSITIONS = ["All", "QB", "WR", "OT", "EDGE", "CB", "DT", "RB", "LB", "S", "TE"];

export default function LiveStage({
  currentPick,        // { number }
  currentTeam,        // { name, needs: string[] }
  currentStatus,      // "on_clock" | "pick_is_in" | "revealed"
  currentLocked,      // bool — true when a live_card row exists
  currentSelection,   // prospect | null — what was locked (or queue pick)
  suggestedProspect,  // prospect | null — from user's pre-draft prediction
  countdownLabel,     // string, e.g. "04:18"
  actualPick,         // prospect | null — official pick once revealed
  poolState,          // [{ id, name, locked, result, prospect, isCurrentUser }]
  boardIds,           // string[] — board order for search ranking
  prospects,          // Prospect[] — full list
  draftedIds,         // Set<string> — already taken prospect IDs
  onLockIn,           // (prospectId) => void — immediate submit
  onChangePick,       // () => void — reset locked card
  nextPickLabel,      // string, e.g. "Jets on the clock — Pick 2 →"
  onNextPick,         // () => void — optional next-pick action
}) {
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("All");

  const isRevealed = currentStatus === "revealed";
  const stage = isRevealed ? "reveal" : currentLocked ? "locked" : "on_clock";

  const submittedCount = poolState.filter((m) => m.locked).length;
  const totalCount = poolState.length;

  // Search results sorted by board order
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const boardIndex = (id) => { const i = boardIds.indexOf(id); return i === -1 ? 9999 : i; };
    return prospects
      .filter((p) => !draftedIds.has(p.id))
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .filter((p) => posFilter === "All" || p.position.includes(posFilter))
      .sort((a, b) => boardIndex(a.id) - boardIndex(b.id))
      .slice(0, 8);
  }, [prospects, draftedIds, boardIds, isSearching, search, posFilter]);

  function handleLockIn(prospectId) {
    onLockIn(prospectId);
    setIsSearching(false);
    setSearch("");
    setPosFilter("All");
  }

  function handleSearchForOther() {
    setIsSearching(true);
    setSearch("");
    setPosFilter("All");
  }

  function handleUseQueuePick() {
    if (suggestedProspect) handleLockIn(suggestedProspect.id);
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
      <div className="ls-header">
        <div className="ls-team-block">
          <div className="ls-pick-label">Pick {currentPick?.number} · {stage === "locked" ? "Card submitted — waiting on announcement" : "Now Selecting"}</div>
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
              <span className="ls-timer-label">Submit in</span>
              <span className="ls-timer-val">{countdownLabel}</span>
            </>
          )}
        </div>
      </div>

      <div className="ls-divider" />

      {/* ══ STATE: on_clock ══ */}
      {stage === "on_clock" && !isSearching && (
        <>
          {suggestedProspect ? (
            <div className="ls-queue">
              <div className="ls-queue-label">Your Queue Pick</div>
              <div className="ls-queue-player">
                <div className="ls-queue-info">
                  <div className="ls-queue-name">{suggestedProspect.name}</div>
                  <div className="ls-queue-meta">
                    {suggestedProspect.position} · {suggestedProspect.school}
                    {suggestedProspect.consensus_rank ? ` · #${suggestedProspect.consensus_rank} consensus` : ""}
                  </div>
                </div>
                {boardIds.indexOf(suggestedProspect.id) !== -1 ? (
                  <div className="ls-queue-rank">
                    <span className="ls-queue-rank-num">#{boardIds.indexOf(suggestedProspect.id) + 1}</span>
                    <span className="ls-queue-rank-label">YOUR BOARD</span>
                  </div>
                ) : null}
              </div>
              <div className="ls-queue-actions">
                <button className="ls-lock-btn" type="button" onClick={handleUseQueuePick}>
                  Lock it in →
                </button>
                <button className="ls-ghost-btn" type="button" onClick={handleSearchForOther}>
                  Search for someone else
                </button>
              </div>
              <div className="ls-hint">Tapping "Lock it in" immediately submits your card. No second step.</div>
            </div>
          ) : (
            <div className="ls-empty-state">
              <div className="ls-empty-icon">?</div>
              <p className="ls-empty-title">No queue pick set for Pick {currentPick?.number}</p>
              <p className="ls-empty-sub">Search the prospect list to lock in your pick, or set up your queue from the Big Board.</p>
              <button className="ls-lock-btn" type="button" style={{ marginTop: 8 }} onClick={handleSearchForOther}>
                Search prospects →
              </button>
            </div>
          )}

          {/* Pool pulse */}
          <div className="ls-pool-pulse">
            <div className="ls-pp-label">Pool Status · Pick {currentPick?.number} · {submittedCount} of {totalCount} in</div>
            <div className="ls-pp-members">
              {poolState.map((m) => {
                const initials = m.name.slice(0, 2).toUpperCase();
                const cls = m.isCurrentUser ? "me" : m.locked ? "submitted" : "pending";
                const statusText = m.isCurrentUser
                  ? (currentLocked ? "locked ✓" : "deciding")
                  : m.locked ? "locked ✓" : "thinking…";
                const statusClass = (m.isCurrentUser ? currentLocked : m.locked) ? "in" : "wait";
                return (
                  <div key={m.id ?? m.name} className="ls-pp-member">
                    <div className={`ls-pp-avatar ${cls}`}>{initials}</div>
                    <div className="ls-pp-name">{m.isCurrentUser ? "you" : m.name}</div>
                    <div className={`ls-pp-status ${statusClass}`}>{statusText}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ══ STATE: searching ══ */}
      {stage === "on_clock" && isSearching && (
        <>
          {/* Compact queue fallback bar */}
          <div className="ls-compact-queue-bar">
            <div className="ls-compact-queue-text">
              {suggestedProspect ? (
                <>Queue: <strong>{suggestedProspect.name}, {suggestedProspect.position}</strong></>
              ) : (
                <span>No queue pick set</span>
              )}
            </div>
            <div className="ls-compact-queue-actions">
              <span className="ls-compact-locked-count">{submittedCount}/{totalCount} locked</span>
              {suggestedProspect ? (
                <button className="ls-ghost-btn" type="button" style={{ padding: "4px 10px", fontSize: 11 }} onClick={handleUseQueuePick}>
                  Use queue pick
                </button>
              ) : null}
            </div>
          </div>

          {/* Search field */}
          <div className="ls-search-wrap">
            <span className="ls-search-ico">🔍</span>
            <input
              className="ls-search-field"
              placeholder="Name or position (e.g. 'Travis' or 'WR')"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
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
              {search || posFilter !== "All" ? "No available prospects match — try a different filter." : "Start typing to search…"}
            </div>
          )}
          <div className="ls-search-hint">Sorted by your board · only available players shown</div>
        </>
      )}

      {/* ══ STATE: locked ══ */}
      {stage === "locked" && (
        <>
          <div className="ls-locked-card">
            <div className="ls-locked-avatar">🏈</div>
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

          {/* Pool — everyone submitted */}
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
          {/* Compact announcement + my result badge */}
          <div className="ls-reveal-announce">
            <div>
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

          {/* Hero: pool comparison grid */}
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
                  <div className="ls-rpc-player">{m.prospect?.name ?? "—"}</div>
                  <div className="ls-rpc-meta">
                    {m.prospect ? `${m.prospect.position} · ${m.prospect.school}` : ""}
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

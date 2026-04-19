/**
 * LiveStage — the center-column "stage" during a live draft pick.
 *
 * Four states driven by props:
 *   1. empty      → no selection yet, prompt the user
 *   2. selected   → a player is chosen but not submitted; Submit lives on the card
 *   3. submitted  → card is locked; waiting for the reveal, show pool momentum
 *   4. reveal     → official pick shown + your submission + result + pool grid
 */
export default function LiveStage({
  currentPick,               // { number }
  currentTeam,               // { name, needs }
  currentSelection,          // prospect | null
  currentLocked,             // bool
  currentStatus,             // "on_clock" | "pick_is_in" | "revealed"
  countdownLabel,            // string
  actualPick,                // prospect | null
  suggestedProspect,         // prospect | null (from user's prediction)
  poolState,                 // [{ id, name, locked, status, prospect, result, isCurrentUser }]
  onSubmit,                  // () => void
  onUseSuggestion,           // () => void
  onClearSelection,          // () => void
}) {
  const isRevealed = currentStatus === "revealed";
  const stage = isRevealed
    ? "reveal"
    : currentLocked
      ? "submitted"
      : currentSelection
        ? "selected"
        : "empty";

  const submittedCount = poolState.filter((m) => m.locked).length;
  const totalCount = poolState.length;

  return (
    <section className={`live-stage stage-${stage}`}>
      <header className="live-stage-head">
        <div className="live-stage-meta">
          <span className="micro-label">On the Clock</span>
          <h2>
            {currentTeam?.name}
            <span className="live-stage-pick-num"> · Pick {currentPick?.number}</span>
          </h2>
          {currentTeam?.needs?.length ? (
            <span className="live-stage-needs">Needs {currentTeam.needs.join(" · ")}</span>
          ) : null}
        </div>
        <div className={`live-stage-clock ${isRevealed ? "done" : ""}`}>
          <span className="micro-label">{isRevealed ? "Result" : currentLocked ? "Reveal in" : "Submit in"}</span>
          <strong>{countdownLabel}</strong>
        </div>
      </header>

      {stage === "empty" && (
        <div className="stage-body stage-empty-body">
          <div className="empty-illustration" aria-hidden>
            <span>?</span>
          </div>
          <h3>Who goes {currentPick?.number}?</h3>
          <p>Pick a player from your Big Board on the left, or search the prospect list to set your card.</p>
          {suggestedProspect ? (
            <button className="secondary-button" type="button" onClick={onUseSuggestion}>
              Use your setup: <strong>{suggestedProspect.name}</strong>
            </button>
          ) : null}
        </div>
      )}

      {stage === "selected" && currentSelection && (
        <div className="stage-body">
          <div className="selected-card">
            <div className="selected-card-head">
              <span className="micro-label">Your selection</span>
              <button className="ghost-link" type="button" onClick={onClearSelection}>Change</button>
            </div>
            <div className="selected-player">
              <div className="selected-player-name">
                <strong>{currentSelection.name}</strong>
                <span>{currentSelection.position} · {currentSelection.school}</span>
              </div>
              {currentSelection.consensus_rank ? (
                <span className="rank-chip">#{currentSelection.consensus_rank}</span>
              ) : null}
            </div>
            <button className="primary-button submit-card-btn" type="button" onClick={onSubmit}>
              Submit the card
            </button>
            <span className="submit-helper">Lock it in before the pool reveals. You can still change until you submit.</span>
          </div>
          <div className="pool-momentum">
            <div className="momentum-bar">
              <div className="momentum-fill" style={{ width: `${totalCount ? (submittedCount / totalCount) * 100 : 0}%` }} />
            </div>
            <span className="momentum-label">{submittedCount} of {totalCount} submitted</span>
          </div>
        </div>
      )}

      {stage === "submitted" && (
        <div className="stage-body">
          <div className="submitted-card">
            <span className="submitted-badge">✓ Card submitted</span>
            <div className="selected-player">
              <div className="selected-player-name">
                <strong>{currentSelection?.name}</strong>
                <span>{currentSelection?.position} · {currentSelection?.school}</span>
              </div>
            </div>
            <span className="submit-helper">Locked. Waiting for the pool and the real pick to reveal.</span>
          </div>
          <div className="pool-momentum">
            <div className="momentum-bar">
              <div className="momentum-fill" style={{ width: `${totalCount ? (submittedCount / totalCount) * 100 : 0}%` }} />
            </div>
            <span className="momentum-label">{submittedCount} of {totalCount} submitted</span>
          </div>
          <div className="submitted-activity">
            <span className="micro-label">Pool activity</span>
            <ul>
              {poolState.map((m) => (
                <li key={m.id ?? m.name} className={m.locked ? "locked" : "waiting"}>
                  <span className="activity-dot" />
                  <span className="activity-name">{m.name}{m.isCurrentUser ? " (you)" : ""}</span>
                  <span className="activity-status">{m.locked ? "Submitted" : "Choosing"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {stage === "reveal" && (
        <div className="stage-body">
          <div className="reveal-card">
            <div className="reveal-official">
              <span className="micro-label">Official pick</span>
              <div className="selected-player">
                <div className="selected-player-name">
                  <strong>{actualPick?.name ?? "—"}</strong>
                  <span>{actualPick ? `${actualPick.position} · ${actualPick.school}` : ""}</span>
                </div>
              </div>
            </div>
            <div className="reveal-you">
              <span className="micro-label">You submitted</span>
              <div className="selected-player">
                <div className="selected-player-name">
                  <strong>{currentSelection?.name ?? "—"}</strong>
                  <span>{currentSelection ? `${currentSelection.position} · ${currentSelection.school}` : ""}</span>
                </div>
                {(() => {
                  const me = poolState.find((m) => m.isCurrentUser);
                  const result = me?.result ?? "miss";
                  if (result === "exact") return <span className="result-chip exact">Exact hit +5</span>;
                  if (result === "position") return <span className="result-chip near">Position hit +2</span>;
                  return <span className="result-chip miss">Miss</span>;
                })()}
              </div>
            </div>
          </div>
          <div className="reveal-pool">
            <span className="micro-label">Pool results</span>
            <div className="reveal-pool-grid">
              {poolState.map((m) => (
                <div
                  key={m.id ?? m.name}
                  className={`reveal-pool-card ${m.result ?? "miss"}${m.isCurrentUser ? " is-you" : ""}`}
                >
                  <strong>{m.name}{m.isCurrentUser ? " (you)" : ""}</strong>
                  <span>{m.prospect?.name ?? "—"}</span>
                  <span className="reveal-pool-tag">
                    {m.result === "exact" ? "Exact" : m.result === "position" ? "Position" : "Miss"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * SubmitWindowBanner — 20-second pool submit window indicator.
 *
 * Three tiers driven by useSubmitWindow:
 *
 *  calm   you're locked, pool is locked
 *         → small quiet badge in header area, barely noticeable
 *
 *  active you're locked but others aren't, OR you're unlocked with time remaining
 *         → medium amber bar above stage, "X seconds to lock in"
 *
 *  urgent <5s left AND someone's still unlocked
 *         → full-width red bar, large pulsing countdown, "FALLBACK IN Xs"
 *
 * Rendered null when window is inactive (on_clock or revealed).
 */
export default function SubmitWindowBanner({ secondsLeft, tier, currentLocked, poolState }) {
  if (tier === null || secondsLeft === null) return null;

  const anyoneUnlocked = poolState.some((m) => !m.locked && !m.isCurrentUser);
  const unlockedNames = poolState
    .filter((m) => !m.locked && !m.isCurrentUser)
    .map((m) => m.name);

  if (tier === "calm") {
    return (
      <div className="swb swb-calm">
        <span className="swb-calm-text">Pool ready</span>
        <span className="swb-calm-timer">{secondsLeft}s</span>
      </div>
    );
  }

  if (tier === "urgent") {
    return (
      <div className="swb swb-urgent">
        <div className="swb-urgent-inner">
          <div className="swb-urgent-label">FALLBACK IN</div>
          <div className="swb-urgent-count">{secondsLeft}</div>
          {anyoneUnlocked && (
            <div className="swb-urgent-who">
              {unlockedNames.length === 1
                ? `${unlockedNames[0]} hasn't locked`
                : `${unlockedNames.length} members haven't locked`}
            </div>
          )}
        </div>
      </div>
    );
  }

  // active tier
  return (
    <div className={`swb swb-active ${!currentLocked ? "you-unlocked" : ""}`}>
      <div className="swb-active-left">
        {!currentLocked ? (
          <>
            <span className="swb-active-icon">⚡</span>
            <span className="swb-active-msg">Lock in your pick</span>
          </>
        ) : (
          <>
            <span className="swb-active-icon">✓</span>
            <span className="swb-active-msg">
              {unlockedNames.length === 1
                ? `Waiting on ${unlockedNames[0]}`
                : `Waiting on ${unlockedNames.length} members`}
            </span>
          </>
        )}
      </div>
      <div className="swb-active-timer">{secondsLeft}s</div>
    </div>
  );
}

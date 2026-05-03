/**
 * SubmitWindowBanner — 20-second pool submit window indicator.
 *
 * Three tiers driven by useSubmitWindow:
 *
 *  calm   everyone has submitted
 *         → small quiet badge in header area, timer still runs
 *
 *  active you're submitted but others aren't, OR you're unsubmitted with time remaining
 *         → medium amber bar above stage, "X seconds to lock in"
 *
 *  urgent <5s left AND someone still has not submitted
 *         → full-width red bar, large pulsing countdown, "FALLBACK IN Xs"
 *
 * Rendered null when window is inactive (on_clock or revealed).
 */
export default function SubmitWindowBanner({ secondsLeft, tier, currentSubmitted, poolState }) {
  if (tier === null || secondsLeft === null) return null;

  const anyoneUnsubmitted = poolState.some((m) => !m.submitted && !m.isCurrentUser);
  const unsubmittedNames = poolState
    .filter((m) => !m.submitted && !m.isCurrentUser)
    .map((m) => m.name);

  if (tier === "calm") {
    return (
      <div className="swb swb-calm">
        <span className="swb-calm-text">All picks submitted</span>
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
          {anyoneUnsubmitted && (
            <div className="swb-urgent-who">
              {unsubmittedNames.length === 1
                ? `${unsubmittedNames[0]} has not submitted`
                : `${unsubmittedNames.length} members have not submitted`}
            </div>
          )}
        </div>
      </div>
    );
  }

  // active tier
  return (
    <div className={`swb swb-active ${!currentSubmitted ? "you-unlocked" : ""}`}>
      <div className="swb-active-left">
        {!currentSubmitted ? (
          <>
            <span className="swb-active-icon">⚡</span>
            <span className="swb-active-msg">Submit before fallback</span>
          </>
        ) : (
          <>
            <span className="swb-active-icon">✓</span>
            <span className="swb-active-msg">
              {unsubmittedNames.length === 1
                ? `Waiting on ${unsubmittedNames[0]}`
                : `Waiting on ${unsubmittedNames.length} members`}
            </span>
          </>
        )}
      </div>
      <div className="swb-active-timer">{secondsLeft}s</div>
    </div>
  );
}

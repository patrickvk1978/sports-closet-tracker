import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { describeRoundScoring } from "../lib/seriesPickem";

const SCORING_ROWS = [
  { roundKey: "round_1", label: "Round 1" },
  { roundKey: "semifinals", label: "Conference semifinals" },
  { roundKey: "finals", label: "Conference finals" },
  { roundKey: "nba_finals", label: "NBA Finals" },
];

export default function PoolSettingsPage() {
  const { pool, settingsForPool, updatePoolMeta, updatePoolSettings, memberList } = usePool();
  const { profile } = useAuth();
  const { roundSummaries } = usePlayoffData();

  const isCommissioner = pool?.admin_id === profile?.id;
  const isSiteAdmin = Boolean(profile?.is_admin);
  const settings = settingsForPool(pool);
  const [name, setName] = useState(pool?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const sharePath = `/join?code=${pool?.invite_code ?? ""}`;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : sharePath;
  const roundLocks = settings.round_locks ?? {};

  const visibleRounds = useMemo(
    () => roundSummaries.filter((round) => round.key !== "play_in"),
    [roundSummaries]
  );

  if (!isCommissioner) {
    return (
      <div className="panel">
        <h2>Pool Settings</h2>
        <p className="subtle">Only the pool creator can edit NBA playoff rules and invite settings.</p>
      </div>
    );
  }

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaved(false);

    await updatePoolMeta({ name: name.trim() || pool.name });
    const form = new FormData(event.currentTarget);

    await updatePoolSettings({
      allow_edits_until_tipoff: form.get("allow_edits_until_tipoff") === "true",
    });

    setSaved(true);
  }

  return (
    <form className="settings-grid" onSubmit={handleSave}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Commissioner tools</span>
            <h2>Pool control room</h2>
          </div>
          {saved ? <span className="pill-meta">Saved</span> : null}
        </div>

        <div className="settings-form-grid two-up">
          <label className="field">
            <span>Pool name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div className="detail-card">
            <span className="micro-label">Commissioner</span>
            <p>{memberList.find((member) => member.isCommissioner)?.name ?? "Pool creator"}</p>
          </div>

          <div className="detail-card">
            <span className="micro-label">Invite code</span>
            <p>{pool?.invite_code}</p>
          </div>

          <div className="detail-card">
            <span className="micro-label">Member count</span>
            <p>{memberList.length} pool members</p>
          </div>
        </div>

        <div className="commissioner-actions">
          <button className="secondary-button" type="button" onClick={handleCopyInvite}>
            {copied ? "Invite Link Copied" : "Copy Invite Link"}
          </button>
          <Link className="secondary-button" to="/pool-members">
            View Members
          </Link>
          <div className="detail-card commissioner-inline-card">
            <span className="micro-label">Share path</span>
            <p>{sharePath}</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Gameplay rules</span>
            <h2>Scoring and edit rules</h2>
          </div>
        </div>

        <div className="settings-form-grid">
          <div className="detail-card">
            <span className="micro-label">Contest scoring</span>
            <p>Series Pick&apos;em uses a fixed round-weighted model. Exact winner and length earn the most, with a bonus for exact 4-game sweeps and exact 7-game calls.</p>
          </div>
          <div className="settings-form-grid three-up">
            {SCORING_ROWS.map((row) => {
              const scoring = describeRoundScoring(row.roundKey, settings);
              return (
                <div className="detail-card" key={row.roundKey}>
                  <span className="micro-label">{row.label}</span>
                  <p>
                    Exact 5/6: {scoring.exactBase} pts
                    <br />
                    Exact 4/7: {scoring.exactEdge} pts
                    <br />
                    Off by 1: {scoring.offBy1} pts
                    <br />
                    Off by 2: {scoring.offBy2} pts
                  </p>
                </div>
              );
            })}
          </div>
          <label className="field">
            <span>Lock each series at tipoff</span>
            <select
              name="allow_edits_until_tipoff"
              defaultValue={String(settings.allow_edits_until_tipoff ?? true)}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <div className="detail-card">
            <span className="micro-label">Why 4 and 7 are worth more</span>
            <p>Five- and six-game predictions are naturally safer because they sit in the middle. Exact sweeps and exact seven-game calls get a one-point edge bonus to balance that.</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Bracket page</span>
            <p>The Bracket tab is now a visual playoff map for your selections, not a separate contest type or scoring mode.</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Round locks</span>
            <p>Commissioners can lock or unlock each playoff round below. Locked rounds become read-only on the Series board.</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Series unlocks</span>
            <p>Once a series locks at tipoff, the commissioner can still reopen that one series for everyone from the Series page.</p>
          </div>
        </div>

        <div className="entry-actions">
          <button className="primary-button" type="submit">Save Settings</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Round control</span>
            <h2>Lock status and playoff windows</h2>
          </div>
        </div>

        <div className="settings-form-grid">
          {visibleRounds.map((round) => (
            <div className="detail-card commissioner-round-card" key={round.key}>
              <div className="commissioner-round-head">
                <div>
                  <span className="micro-label">{round.shortLabel}</span>
                  <strong>{round.label}</strong>
                </div>
                <span className={roundLocks[round.key] ? "chip active" : "chip"}>
                  {roundLocks[round.key] ? "Locked" : "Open"}
                </span>
              </div>
              <p>
                {round.completedSeries} of {round.totalSeries} series complete
                {round.liveSeries ? ` · ${round.liveSeries} live` : ""}
              </p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => updatePoolSettings({
                  round_locks: {
                    ...roundLocks,
                    [round.key]: !roundLocks[round.key],
                  },
                })}
              >
                {roundLocks[round.key] ? "Unlock Round" : "Lock Round"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Commissioner guidance</span>
            <h2>What belongs here vs admin</h2>
          </div>
        </div>

        <div className="nba-placeholder-grid">
          <article className="detail-card inset-card">
            <span className="micro-label">Commissioner</span>
            <p>Pool identity, invite flow, scoring rules, and round locks for this one pool.</p>
          </article>
          <article className="detail-card inset-card">
            <span className="micro-label">Members</span>
            <p>Review the current pool roster and share the invite link from this screen.</p>
          </article>
          <article className="detail-card inset-card">
            <span className="micro-label">Site admin</span>
            <p>{isSiteAdmin ? "You also have platform-level access in Admin for global maintenance." : "Platform-wide fixes and data operations belong in Admin, not commissioner settings."}</p>
          </article>
        </div>
      </section>
    </form>
  );
}

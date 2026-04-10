import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";

export default function PoolSettingsPage() {
  const { pool, settingsForPool, updatePoolMeta, updatePoolSettings, memberList } = usePool();
  const { profile } = useAuth();
  const { roundSummaries } = usePlayoffData();

  const isCommissioner = pool?.admin_id === profile?.id;
  const isSiteAdmin = Boolean(profile?.is_admin);
  const isSeriesMode = pool?.game_mode === "series_pickem";
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

    if (isSeriesMode) {
      await updatePoolSettings({
        points_per_correct_series: Number(form.get("points_per_correct_series")),
        bonus_for_exact_games: Number(form.get("bonus_for_exact_games")),
        allow_edits_until_tipoff: form.get("allow_edits_until_tipoff") === "true",
      });
    } else {
      await updatePoolSettings({
        rounds: Number(form.get("rounds")),
        reseed_after_round: form.get("reseed_after_round") === "true",
        lock_behavior: form.get("lock_behavior"),
      });
    }

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
            <h2>{isSeriesMode ? "Scoring and edit rules" : "Bracket rules"}</h2>
          </div>
        </div>

        {isSeriesMode ? (
          <div className="settings-form-grid three-up">
            <label className="field">
              <span>Correct series</span>
              <input
                name="points_per_correct_series"
                type="number"
                min="0"
                defaultValue={pool?.settings?.points_per_correct_series ?? 3}
              />
            </label>
            <label className="field">
              <span>Exact games bonus</span>
              <input
                name="bonus_for_exact_games"
                type="number"
                min="0"
                defaultValue={pool?.settings?.bonus_for_exact_games ?? 1}
              />
            </label>
            <label className="field">
              <span>Allow edits until tipoff</span>
              <select
                name="allow_edits_until_tipoff"
                defaultValue={String(pool?.settings?.allow_edits_until_tipoff ?? true)}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <div className="detail-card">
              <span className="micro-label">Round locks</span>
              <p>Commissioners can lock or unlock each playoff round below. Locked rounds become read-only on the Series board.</p>
            </div>
          </div>
        ) : (
          <div className="settings-form-grid three-up">
            <label className="field">
              <span>Rounds</span>
              <input name="rounds" type="number" min="1" max="4" defaultValue={pool?.settings?.rounds ?? 4} />
            </label>
            <label className="field">
              <span>Reseed after each round</span>
              <select name="reseed_after_round" defaultValue={String(pool?.settings?.reseed_after_round ?? false)}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>
            <label className="field">
              <span>Lock behavior</span>
              <select name="lock_behavior" defaultValue={pool?.settings?.lock_behavior ?? "before_tipoff"}>
                <option value="before_tipoff">Before each game tips</option>
                <option value="full_bracket_lock">Lock full bracket at playoff start</option>
              </select>
            </label>
          </div>
        )}

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
              {isSeriesMode ? (
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
              ) : (
                <p className="subtle">Bracket lock behavior is handled by the rules above.</p>
              )}
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

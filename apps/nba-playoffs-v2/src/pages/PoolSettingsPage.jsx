import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { buildScoringTable } from "../lib/teamValueGame";

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
  const scoringTable = useMemo(() => buildScoringTable(16), []);

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
            <h2>Team Value control room</h2>
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
            <p>{memberList.length} board entries</p>
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
            <h2>Scoring and lock rules</h2>
          </div>
        </div>

        <div className="settings-form-grid">
          <div className="detail-card">
            <span className="micro-label">Contest scoring</span>
            <p>The team-value game locks a unique 16-to-1 ranking before the playoffs begin. Every series win scores team value plus a round bonus and a dominance bonus.</p>
          </div>
          <div className="settings-form-grid three-up">
            {scoringTable.map((row) => (
              <div className="detail-card" key={row.roundKey}>
                <span className="micro-label">{row.label}</span>
                <p>
                  {row.byGames.map((entry) => `Win in ${entry.games}: ${entry.points}`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
          <label className="field">
            <span>Allow edits until playoff lock</span>
            <select
              name="allow_edits_until_tipoff"
              defaultValue={String(pool?.settings?.allow_edits_until_tipoff ?? true)}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <div className="detail-card">
            <span className="micro-label">Why shorter wins matter more</span>
            <p>The format rewards dominance. A sweep gets the biggest bonus, then five, then six, then seven. Later rounds also carry bigger bonuses by default.</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Board lock</span>
            <p>Commissioners can keep boards editable into the week or lock them once the playoff field is set. After lock, the board becomes read-only and the contest shifts to tracking live value.</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Round locks</span>
            <p>Commissioners can still lock or unlock the later playoff windows below, but the main contest is driven by the single pre-playoff board rather than round-by-round picks.</p>
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

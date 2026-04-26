import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { buildScoringTable } from "../lib/teamValueGame";

function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function PoolSettingsPage() {
  const { pool, settingsForPool, updatePoolMeta, updatePoolSettings, memberList } = usePool();
  const { profile, session } = useAuth();
  const { roundSummaries } = usePlayoffData();

  const currentUserId = session?.user?.id ?? profile?.id ?? null;
  const isCommissioner = pool?.admin_id === currentUserId;
  const isSiteAdmin = Boolean(profile?.is_admin);
  const canManageSettings = isCommissioner || isSiteAdmin;
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

  if (!canManageSettings) {
    return (
      <div className="panel">
        <h2>Pool Settings</h2>
        <p className="subtle">Only the commissioner or a site admin can edit NBA playoff rules and invite settings.</p>
        <Link className="secondary-button" to="/dashboard">
          Back to Dashboard
        </Link>
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
    const form = new FormData(event.currentTarget);
    const lockAtValue = String(form.get("lock_at") ?? "").trim();

    await updatePoolMeta({ name: name.trim() || pool.name });

    await updatePoolSettings({
      allow_edits_until_tipoff: form.get("allow_edits_until_tipoff") === "true",
      lock_at: lockAtValue ? new Date(lockAtValue).toISOString() : settings.lock_at,
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
            <span className="micro-label">Your access</span>
            <p>{isCommissioner ? "Commissioner" : isSiteAdmin ? "Site admin override" : "Member"}</p>
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
            <p>The team-value game locks a unique 16-to-1 ranking before the playoffs begin. Rank 1 earns 16 points for every playoff win, rank 2 earns 15, and so on down to rank 16 earning 1 point per win. Series winners also earn an advancement bonus that scales with that team&apos;s rank value.</p>
          </div>
          <div className="settings-form-grid three-up">
            {scoringTable.map((row) => (
              <div className="detail-card" key={row.roundKey}>
                <span className="micro-label">{row.label}</span>
                <p>
                  Rank 1: {row.perWin[0]?.points ?? 16} per win
                </p>
                <p>
                  Series win bonus: +{row.roundBonusMultiplier}x rank value
                </p>
              </div>
            ))}
          </div>
          <label className="field">
            <span>Board stays editable until</span>
            <input
              type="datetime-local"
              name="lock_at"
              defaultValue={formatDateTimeLocal(settings.lock_at)}
            />
          </label>
          <label className="field">
            <span>Use automatic board lock</span>
            <select
              name="allow_edits_until_tipoff"
              defaultValue={String(settings.allow_edits_until_tipoff ?? true)}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <div className="detail-card">
            <span className="micro-label">Why every game matters</span>
            <p>There is no series-length bonus now. A long series creates more scoring chances through individual game wins, while advancing still matters because later-round series bonuses multiply each board&apos;s rank value.</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Board lock</span>
            <p>Commissioners can move the board lock later if they want everyone to keep editing deeper into Round 1. After lock, the board becomes read-only unless the commissioner reopens it by changing the lock time again.</p>
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
            <span className="label">Other playoff windows</span>
            <h2>Round-level visibility controls</h2>
          </div>
        </div>

        <div className="settings-form-grid">
          <div className="detail-card">
            <span className="micro-label">Important</span>
            <p>These round toggles do not lock the main board. The board lock is controlled only by the datetime above.</p>
          </div>
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

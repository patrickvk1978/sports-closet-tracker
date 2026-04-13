import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";

export default function PoolSettingsPage() {
  const { pool, members, updatePoolMeta, updatePoolSettings } = usePool();
  const { profile } = useAuth();
  const isCommissioner = pool?.admin_id === profile?.id;
  const [name, setName] = useState(pool?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState("");

  const settings = useMemo(
    () => ({
      missedPickBehavior: pool?.settings?.missed_pick_behavior ?? "eliminate",
      tieBehavior: pool?.settings?.tie_behavior ?? "eliminate",
      lockBehavior: pool?.settings?.lock_behavior ?? "game_kickoff",
      entryFormat: pool?.settings?.entry_format ?? "single_entry",
      picksReveal: pool?.settings?.picks_reveal ?? "after_lock",
      lateSwapAllowed: pool?.settings?.late_swap_allowed ?? false,
      revivalPolicy: pool?.settings?.revival_policy ?? "none",
      rebuyEnabled: pool?.settings?.rebuy_enabled ?? false,
      maxRebuys: pool?.settings?.max_rebuys ?? 0,
      lastRebuyWeek: pool?.settings?.last_rebuy_week ?? 4,
    }),
    [pool]
  );

  const invitePath = `/join?code=${pool?.invite_code ?? ""}`;
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}${invitePath}` : invitePath;

  async function copyValue(value, key) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {}
  }

  if (!isCommissioner) {
    return (
      <div className="panel">
        <h2>Pool Settings</h2>
        <p className="subtle">Only the pool commissioner can edit Survivor rules and invite controls.</p>
      </div>
    );
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaved(false);

    await updatePoolMeta({ name: name.trim() || pool.name });
    const form = new FormData(event.currentTarget);
    await updatePoolSettings({
      missed_pick_behavior: form.get("missed_pick_behavior"),
      tie_behavior: form.get("tie_behavior"),
      lock_behavior: form.get("lock_behavior"),
      entry_format: form.get("entry_format"),
      picks_reveal: form.get("picks_reveal"),
      late_swap_allowed: form.get("late_swap_allowed") === "true",
      revival_policy: form.get("revival_policy"),
      rebuy_enabled: form.get("rebuy_enabled") === "true",
      max_rebuys: Number(form.get("max_rebuys")),
      last_rebuy_week: Number(form.get("last_rebuy_week")),
    });

    setSaved(true);
  }

  return (
    <div className="simple-shell survivor-shell">
      <form className="settings-grid survivor-settings-grid" onSubmit={handleSave}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Commissioner console</span>
            <h2>Pool identity</h2>
          </div>
          {saved ? <span className="pill-meta">Saved</span> : null}
        </div>

        <div className="settings-form-grid">
          <label className="field">
            <span>Pool name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>

        <div className="settings-form-grid three-up">

          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Invite code</span>
            <strong>{pool?.invite_code}</strong>
            <div className="entry-actions compact">
              <button className="secondary-button" type="button" onClick={() => copyValue(pool?.invite_code ?? "", "code")}>
                {copied === "code" ? "Copied" : "Copy code"}
              </button>
            </div>
          </div>

          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Invite link</span>
            <p>{invitePath}</p>
            <div className="entry-actions compact">
              <button className="secondary-button" type="button" onClick={() => copyValue(inviteUrl, "link")}>
                {copied === "link" ? "Copied" : "Copy invite link"}
              </button>
            </div>
          </div>

          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Roster</span>
            <strong>{members.length} members</strong>
            <p>Keep invite flow and member visibility clean before anything more exotic.</p>
            <div className="entry-actions compact">
              <Link className="secondary-button" to="/pool-members">
                View members
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Gameplay rules</span>
            <h2>Weekly format</h2>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <label className="field">
            <span>Entry format</span>
            <select name="entry_format" defaultValue={settings.entryFormat}>
              <option value="single_entry">One entry per member</option>
              <option value="multi_entry">Multiple entries later</option>
            </select>
          </label>
          <label className="field">
            <span>Missed picks</span>
            <select name="missed_pick_behavior" defaultValue={settings.missedPickBehavior}>
              <option value="eliminate">Eliminate entry</option>
              <option value="pending">Hold for commissioner review</option>
            </select>
          </label>
          <label className="field">
            <span>Ties</span>
            <select name="tie_behavior" defaultValue={settings.tieBehavior}>
              <option value="eliminate">Eliminate entry</option>
              <option value="advance">Advance entry</option>
            </select>
          </label>
          <label className="field">
            <span>Lock behavior</span>
            <select name="lock_behavior" defaultValue={settings.lockBehavior}>
              <option value="game_kickoff">Selected game kickoff</option>
              <option value="week_kickoff">Week kickoff</option>
            </select>
          </label>
          <label className="field">
            <span>Picks become public</span>
            <select name="picks_reveal" defaultValue={settings.picksReveal}>
              <option value="after_lock">After the week locks</option>
              <option value="after_games_start">After games start</option>
              <option value="after_results">After results only</option>
            </select>
          </label>
          <label className="field">
            <span>Late swap</span>
            <select name="late_swap_allowed" defaultValue={String(settings.lateSwapAllowed)}>
              <option value="false">Off</option>
              <option value="true">Allow until your selected kickoff</option>
            </select>
          </label>
          <label className="field">
            <span>Revival policy</span>
            <select name="revival_policy" defaultValue={settings.revivalPolicy}>
              <option value="none">No revivals</option>
              <option value="commissioner_only">Commissioner may revive manually</option>
            </select>
          </label>
          <label className="field">
            <span>Rebuy</span>
            <select name="rebuy_enabled" defaultValue={String(settings.rebuyEnabled)}>
              <option value="false">No rebuys</option>
              <option value="true">Allow rebuys</option>
            </select>
          </label>
          <label className="field">
            <span>Max rebuys per entry</span>
            <input name="max_rebuys" type="number" min="0" max="5" defaultValue={settings.maxRebuys} />
          </label>
          <label className="field">
            <span>Last rebuy-eligible week</span>
            <input name="last_rebuy_week" type="number" min="1" max="18" defaultValue={settings.lastRebuyWeek} />
          </label>
        </div>

        <div className="entry-actions">
          <button className="primary-button" type="submit">Save Settings</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Commissioner actions</span>
            <h2>This week at a glance</h2>
          </div>
        </div>

        <div className="settings-form-grid three-up">
          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Lock rule</span>
            <strong>{settings.lockBehavior === "game_kickoff" ? "Each entry locks at its own kickoff" : "The whole week locks at first kickoff"}</strong>
            <p>That is the single biggest feel-setting for the game board.</p>
          </div>
          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Hidden-pick policy</span>
            <strong>{settings.picksReveal === "after_lock" ? "Picks stay hidden until lock" : settings.picksReveal === "after_games_start" ? "Picks reveal once games begin" : "Picks stay hidden until results land"}</strong>
            <p>This should stay explicit. Trust around hidden picks is part of the product.</p>
          </div>
          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Missed-pick ruling</span>
            <strong>{settings.missedPickBehavior === "eliminate" ? "Automatic knockout" : "Commissioner review required"}</strong>
            <p>Good default discipline now saves a lot of Sunday cleanup later.</p>
          </div>
          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Rebuy policy</span>
            <strong>{settings.rebuyEnabled ? `${settings.maxRebuys} rebuy${settings.maxRebuys === 1 ? "" : "s"} allowed through Week ${settings.lastRebuyWeek}` : "No rebuys"}</strong>
            <p>If this is on, the deadline and max count need to be crystal clear to the room.</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Default posture</span>
            <h2>What we are optimizing for</h2>
          </div>
        </div>
        <div className="survivor-note-stack">
          <div className="detail-card">
            <strong>Clean default Survivor</strong>
            <p>One entry, one pick per week, no repeats, hidden picks until lock, and strict elimination on missed selections.</p>
          </div>
          <div className="detail-card">
            <strong>What can wait</strong>
            <p>Buy-backs, strikes, and creative revival mechanics are optional flourishes. The trustworthy weekly loop comes first.</p>
          </div>
        </div>
      </section>
      </form>
    </div>
  );
}

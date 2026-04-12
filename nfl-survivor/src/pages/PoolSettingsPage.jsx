import { useState } from "react";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";

export default function PoolSettingsPage() {
  const { pool, updatePoolMeta, updatePoolSettings } = usePool();
  const { profile } = useAuth();
  const isCommissioner = pool?.admin_id === profile?.id;
  const [name, setName] = useState(pool?.name ?? "");
  const [saved, setSaved] = useState(false);

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
      season: Number(form.get("season")),
      missed_pick_behavior: form.get("missed_pick_behavior"),
      tie_behavior: form.get("tie_behavior"),
      lock_behavior: form.get("lock_behavior"),
    });

    setSaved(true);
  }

  return (
    <form className="settings-grid" onSubmit={handleSave}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Commissioner tools</span>
            <h2>Pool Settings</h2>
          </div>
          {saved ? <span className="pill-meta">Saved</span> : null}
        </div>

        <div className="settings-form-grid">
          <label className="field">
            <span>Pool name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div className="detail-card">
            <span className="micro-label">Pool type</span>
            <p>Survivor pool</p>
          </div>

          <div className="detail-card">
            <span className="micro-label">Invite code</span>
            <p>{pool?.invite_code}</p>
          </div>

          <div className="detail-card">
            <span className="micro-label">Share link</span>
            <p>{`/join?code=${pool?.invite_code ?? ""}`}</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Gameplay</span>
            <h2>Survivor rules</h2>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <label className="field">
            <span>Season</span>
            <input name="season" type="number" min="2026" defaultValue={pool?.settings?.season ?? 2026} />
          </label>
          <label className="field">
            <span>Missed picks</span>
            <select name="missed_pick_behavior" defaultValue={pool?.settings?.missed_pick_behavior ?? "eliminate"}>
              <option value="eliminate">Eliminate entry</option>
              <option value="pending">Leave pending</option>
            </select>
          </label>
          <label className="field">
            <span>Ties</span>
            <select name="tie_behavior" defaultValue={pool?.settings?.tie_behavior ?? "eliminate"}>
              <option value="eliminate">Eliminate entry</option>
              <option value="advance">Advance entry</option>
            </select>
          </label>
          <label className="field">
            <span>Lock behavior</span>
            <select name="lock_behavior" defaultValue={pool?.settings?.lock_behavior ?? "game_kickoff"}>
              <option value="game_kickoff">Selected game kickoff</option>
              <option value="week_kickoff">Week kickoff</option>
            </select>
          </label>
        </div>

        <div className="entry-actions">
          <button className="primary-button" type="submit">Save Settings</button>
        </div>
      </section>
    </form>
  );
}

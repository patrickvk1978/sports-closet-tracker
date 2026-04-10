import { useState } from "react";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";

export default function PoolSettingsPage() {
  const { pool, updatePoolMeta, updatePoolSettings } = usePool();
  const { profile } = useAuth();

  const isCommissioner = pool?.admin_id === profile?.id;
  const isSiteAdmin = Boolean(profile?.is_admin);
  const isSeriesMode = pool?.game_mode === "series_pickem";
  const [name, setName] = useState(pool?.name ?? "");
  const [saved, setSaved] = useState(false);

  if (!isCommissioner) {
    return (
      <div className="panel">
        <h2>Pool Settings</h2>
        <p className="subtle">Only the pool creator can edit NBA playoff rules and invite settings.</p>
      </div>
    );
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
            <p>{isSeriesMode ? "Series Pick'em" : "Bracket Pool"}</p>
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
        <div className="nba-role-strip">
          <span className="chip nba-role-chip">Commissioner screen</span>
          <span className="chip nba-role-chip">{isSiteAdmin ? "You also have site admin access" : "Pool members cannot edit these settings"}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Gameplay</span>
            <h2>{isSeriesMode ? "Series scoring" : "Bracket rules"}</h2>
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
              <p>Commissioners can lock or unlock each playoff round directly from the Series board.</p>
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
    </form>
  );
}

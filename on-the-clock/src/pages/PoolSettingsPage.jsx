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
        <p className="subtle">Only the pool creator can edit scoring, fallback behavior, reveal timing, and invite controls.</p>
      </div>
    );
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaved(false);

    await updatePoolMeta({ name: name.trim() || pool.name });
    const form = new FormData(event.currentTarget);

    if (pool.game_mode === "mock_challenge") {
      await updatePoolSettings({
        exact_hit_points: Number(form.get("exact_hit_points")),
        one_away_points: Number(form.get("one_away_points")),
        two_away_points: Number(form.get("two_away_points")),
      });
    } else {
      await updatePoolSettings({
        exact_player_points: Number(form.get("exact_player_points")),
        correct_position_points: Number(form.get("correct_position_points")),
        fallback_method: form.get("fallback_method"),
        reveal_behavior: form.get("reveal_behavior"),
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
            <p>{pool?.game_mode === "mock_challenge" ? "Mock Challenge" : "Live Draft"}</p>
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
            <h2>{pool?.game_mode === "mock_challenge" ? "Mock scoring" : "Live draft rules"}</h2>
          </div>
        </div>

        {pool?.game_mode === "mock_challenge" ? (
          <div className="settings-form-grid three-up">
            <label className="field">
              <span>Exact hit</span>
              <input name="exact_hit_points" type="number" min="0" defaultValue={pool?.settings?.exact_hit_points ?? 3} />
            </label>
            <label className="field">
              <span>1 away</span>
              <input name="one_away_points" type="number" min="0" defaultValue={pool?.settings?.one_away_points ?? 2} />
            </label>
            <label className="field">
              <span>2 away</span>
              <input name="two_away_points" type="number" min="0" defaultValue={pool?.settings?.two_away_points ?? 1} />
            </label>
          </div>
        ) : (
          <div className="settings-form-grid two-up">
            <label className="field">
              <span>Exact player points</span>
              <input name="exact_player_points" type="number" min="0" defaultValue={pool?.settings?.exact_player_points ?? 5} />
            </label>
            <label className="field">
              <span>Correct position points</span>
              <input name="correct_position_points" type="number" min="0" defaultValue={pool?.settings?.correct_position_points ?? 2} />
            </label>
            <label className="field">
              <span>Fallback method</span>
              <select name="fallback_method" defaultValue={pool?.settings?.fallback_method ?? "queue_plus_team_need"}>
                <option value="queue_plus_team_need">Big Board + team need</option>
                <option value="queue_only">Big Board only</option>
              </select>
            </label>
            <label className="field">
              <span>Reveal behavior</span>
              <select name="reveal_behavior" defaultValue={pool?.settings?.reveal_behavior ?? "after_pick"}>
                <option value="after_pick">After pick is revealed</option>
                <option value="pick_is_in">When pick is in</option>
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

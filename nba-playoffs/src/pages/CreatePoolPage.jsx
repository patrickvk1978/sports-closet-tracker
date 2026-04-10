import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePool } from "../hooks/usePool";

const GAME_MODES = [
  {
    key: "bracket_pool",
    title: "Bracket Pool",
    description: "Pick the playoff bracket path, survive each round, and compete across the full postseason.",
    bullets: [
      "Best fit for a full playoff predictor experience",
      "Supports round-by-round advancement logic",
      "Natural home for standings, leverage, and reports",
      "Closest descendant of the tournament tracker model",
    ],
  },
  {
    key: "series_pickem",
    title: "Series Pick'em",
    description: "Pick each matchup and series length for a lighter, more flexible NBA pool mode.",
    bullets: [
      "Lower-friction entry point than a full bracket",
      "Lets us score winners and exact game counts",
      "Can complement the bracket product inside the same app",
      "Good fit for casual groups and late joiners",
    ],
  },
];

function routeForPool(pool) {
  return pool?.game_mode === "series_pickem" ? "/series" : "/bracket";
}

export default function CreatePoolPage() {
  const navigate = useNavigate();
  const { createPool } = usePool();
  const [name, setName] = useState("");
  const [gameMode, setGameMode] = useState("bracket_pool");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const result = await createPool({ name, gameMode });
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    navigate(routeForPool(result.pool));
  }

  return (
    <div className="create-shell">
      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Create pool</span>
            <h2>Choose how this NBA playoff pool should work</h2>
          </div>
        </div>

        <form onSubmit={handleCreate} className="form-stack">
          <label className="field">
            <span>Pool name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Playoff Group Chat" required />
          </label>

          <div className="mode-grid">
            {GAME_MODES.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className={gameMode === mode.key ? "mode-card selected" : "mode-card"}
                onClick={() => setGameMode(mode.key)}
              >
                <h3 className="mode-title">{mode.title}</h3>
                <p className="mode-description">{mode.description}</p>
                <ul className="mode-bullets">
                  {mode.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              </button>
            ))}
          </div>

          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={loading || !name.trim()}>
            {loading ? "Creating…" : "Create Pool"}
          </button>
        </form>
      </div>
    </div>
  );
}

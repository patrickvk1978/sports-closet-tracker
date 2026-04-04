import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePool } from "../hooks/usePool";

const GAME_MODES = [
  {
    key: "live_draft",
    title: "Live Draft",
    description: "Make picks during the draft, react to trades, and compete in real time.",
    bullets: [
      "Edit picks live as teams come on the clock",
      "Use your Big Board and team-need suggestions",
      "Can auto-submit from your board if you step away",
      "Best for highly engaged draft-night groups",
    ],
  },
  {
    key: "mock_challenge",
    title: "Mock Challenge",
    description: "Submit your Round 1 predictions before the draft and watch results unfold live.",
    bullets: [
      "Fill out your picks once before the deadline",
      "No need to be online during the draft",
      "Closest to a bracket-pool experience",
      "Best for larger or more casual groups",
    ],
  },
];

function routeForPool(pool) {
  return pool?.game_mode === "mock_challenge" ? "/mock" : "/draft";
}

export default function CreatePoolPage() {
  const navigate = useNavigate();
  const { createPool } = usePool();
  const [name, setName] = useState("");
  const [gameMode, setGameMode] = useState("live_draft");
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
            <h2>Choose the game mode you'd like to play</h2>
          </div>
        </div>

        <form onSubmit={handleCreate} className="form-stack">
          <label className="field">
            <span>Pool name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Friday Night Room" required />
          </label>

          <div className="mode-grid">
            {GAME_MODES.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className={gameMode === mode.key ? "mode-card selected" : "mode-card"}
                onClick={() => setGameMode(mode.key)}
              >
                <span className="label">{mode.title}</span>
                <h3>{mode.description}</h3>
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePool } from "../hooks/usePool";

function routeForPool(pool) {
  return pool?.game_mode === "mock_challenge" ? "/mock" : "/draft";
}

export default function CreatePoolPage() {
  const navigate = useNavigate();
  const { createPool } = usePool();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const result = await createPool({ name, gameMode: "live_draft" });
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
            <h2>Create a live draft pool</h2>
            <p className="subtle" style={{ marginTop: 8 }}>
              New pools now default to the live draft format.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="form-stack">
          <label className="field">
            <span>Pool name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Friday Night Room" required />
          </label>

          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={loading || !name.trim()}>
            {loading ? "Creating…" : "Create Pool"}
          </button>
        </form>
      </div>
    </div>
  );
}

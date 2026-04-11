import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePool } from "../hooks/usePool";

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
    const result = await createPool({ name, gameMode: "series_pickem" });
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    navigate("/series");
  }

  return (
    <div className="create-shell">
      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Create pool</span>
            <h2>Start a new NBA Playoffs pool</h2>
          </div>
        </div>

        <form onSubmit={handleCreate} className="form-stack">
          <label className="field">
            <span>Pool name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Playoff Group Chat"
              required
            />
          </label>

          <div className="detail-card spotlight">
            <span className="micro-label">Contest format</span>
            <p>Every NBA pool now uses Series Pick&apos;em: pick each series winner and length round by round, then track standings, leverage, and reports from there.</p>
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

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
    navigate("/teams");
  }

  return (
    <div className="create-shell">
      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Create pool</span>
            <h2>Start a new NBA Team Value pool</h2>
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
            <p>Rank the final 16 playoff teams from 16 down to 1. Every game win scores that team&apos;s value, and each series winner adds an advancement bonus that scales by round.</p>
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

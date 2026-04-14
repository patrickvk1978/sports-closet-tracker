import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePool } from "../hooks/usePool";

function routeForPool(pool) {
  return pool?.game_mode === "series_pickem" ? "/series" : "/bracket";
}

export default function JoinPoolPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { joinPool } = usePool();
  const [code, setCode] = useState(() => searchParams.get("code")?.toUpperCase() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const result = await joinPool(code);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    navigate(routeForPool(result.pool));
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark large">NBA</div>
          <h1>Join a Pool</h1>
          <p>Enter your 6-character NBA Playoff Predictor invite code.</p>
        </div>
        <form onSubmit={handleJoin} className="form-stack">
          <label className="field">
            <span>Invite code</span>
            <input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} required />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button full" type="submit" disabled={loading || code.length < 6}>
            {loading ? "Joining…" : "Join Pool"}
          </button>
        </form>
      </div>
    </div>
  );
}

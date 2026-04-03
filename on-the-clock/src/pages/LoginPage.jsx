import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = tab === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, username.trim());
      if (result?.error) {
        setError(result.error.message);
        return;
      }
      navigate("/join");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark large">SC</div>
          <h1>On the Clock</h1>
          <p>Standalone NFL Draft pool app</p>
        </div>

        <div className="auth-tabs">
          <button className={tab === "signin" ? "auth-tab active" : "auth-tab"} onClick={() => setTab("signin")}>Sign In</button>
          <button className={tab === "signup" ? "auth-tab active" : "auth-tab"} onClick={() => setTab("signup")}>Sign Up</button>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          {tab === "signup" ? (
            <label className="field">
              <span>Username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} required />
            </label>
          ) : null}
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button full" type="submit" disabled={loading}>
            {loading ? "Please wait…" : tab === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

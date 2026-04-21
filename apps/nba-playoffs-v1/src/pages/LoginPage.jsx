import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, signUp, resetPassword } = useAuth();
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const result = tab === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, username.trim());

      if (result?.error) {
        setError(result.error.message ?? "Something went wrong");
        return;
      }

      // Email confirmation flow
      if (tab === "signup" && result?.data?.user && !result.data.session) {
        setInfo("Check your email for a confirmation link, then sign in.");
        setTab("signin");
        return;
      }

      navigate("/");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    setError("");
    setLoading(true);
    const { error: resetError } = await resetPassword(email);
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setInfo("Password reset email sent — check your inbox.");
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setInfo("");
    setOauthLoading(true);
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError.message ?? "Google sign-in failed");
      setOauthLoading(false);
    }
  }

  function switchTab(next) {
    setTab(next);
    setError("");
    setInfo("");
  }

  return (
    <div className="auth-shell">
      <div className="auth-card fade-in">
        <div className="auth-brand">
          <div className="brand-mark large">NBA</div>
          <h1>Playoff Bracket Challenge</h1>
          <p>Join a playoff pool, build your bracket, and track every series with friends.</p>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            className={tab === "signin" ? "auth-tab active" : "auth-tab"}
            role="tab"
            aria-selected={tab === "signin"}
            onClick={() => switchTab("signin")}
          >
            Sign In
          </button>
          <button
            className={tab === "signup" ? "auth-tab active" : "auth-tab"}
            role="tab"
            aria-selected={tab === "signup"}
            onClick={() => switchTab("signup")}
          >
            Sign Up
          </button>
        </div>

        {tab === "signin" ? (
          <button
            className="secondary-button full"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || oauthLoading}
          >
            {oauthLoading ? "Redirecting to Google..." : "Continue with Google"}
          </button>
        ) : null}

        <form onSubmit={handleSubmit} className="form-stack">
          {tab === "signup" ? (
            <label className="field">
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="How you'll appear in standings"
                autoComplete="username"
                required
              />
            </label>
          ) : null}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={tab === "signup" ? "At least 8 characters" : ""}
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              required
            />
          </label>

          {tab === "signin" ? (
            <div style={{ textAlign: "right", marginTop: "-8px" }}>
              <button
                type="button"
                style={{ background: "none", border: "none", padding: 0, color: "var(--text-muted)", fontSize: "0.8rem", cursor: "pointer" }}
                onClick={handleResetPassword}
              >
                Forgot password?
              </button>
            </div>
          ) : null}

          {info ? (
            <div
              className="error-box"
              style={{ background: "#f0fdf4", borderColor: "#86efac", color: "#15803d" }}
            >
              {info}
            </div>
          ) : null}

          {error ? <div className="error-box">{error}</div> : null}

          <button className="primary-button full" type="submit" disabled={loading}>
            {loading
              ? tab === "signin" ? "Signing in…" : "Creating account…"
              : tab === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {tab === "signin" ? (
          <p className="subtle" style={{ textAlign: "center" }}>
            New here?{" "}
            <button
              type="button"
              style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", fontWeight: 700, cursor: "pointer" }}
              onClick={() => switchTab("signup")}
            >
              Create an account
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}

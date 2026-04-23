import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword } = useAuth();
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

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
    if (!email) { setError("Enter your email above first."); return; }
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

  function switchTab(next) {
    setTab(next);
    setError("");
    setInfo("");
  }

  return (
    <div className="login-split">
      <div className="login-form-panel">
        {tab === "signin" ? (
          <>
            <div className="login-form-title">Welcome back</div>
            <div className="login-form-sub">Sign in to your pool</div>
          </>
        ) : (
          <>
            <div className="login-form-title">Create account</div>
            <div className="login-form-sub">Join a pool and start predicting</div>
          </>
        )}

        <div className="login-tabs">
          <button
            className={tab === "signin" ? "login-tab active" : "login-tab"}
            type="button"
            onClick={() => switchTab("signin")}
          >
            Sign In
          </button>
          <button
            className={tab === "signup" ? "login-tab active" : "login-tab"}
            type="button"
            onClick={() => switchTab("signup")}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {tab === "signup" ? (
            <>
              <label className="login-field-label">Username</label>
              <input
                className="login-field-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="How you'll appear in standings"
                autoComplete="username"
                required
              />
            </>
          ) : null}

          <label className="login-field-label">Email</label>
          <input
            className="login-field-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label className="login-field-label">Password</label>
          <input
            className="login-field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tab === "signup" ? "At least 8 characters" : "••••••••"}
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            required
          />

          {tab === "signin" ? (
            <button type="button" className="login-forgot" onClick={handleResetPassword}>
              Forgot password?
            </button>
          ) : null}

          {info ? <div className="login-info-box">{info}</div> : null}
          {error ? <div className="error-box" style={{ marginBottom: 14 }}>{error}</div> : null}

          <button className="login-btn-primary" type="submit" disabled={loading}>
            {loading
              ? (tab === "signin" ? "Signing in…" : "Creating account…")
              : (tab === "signin" ? "Sign In" : "Create Account")}
          </button>
        </form>

        <div className="login-footer">
          {tab === "signin" ? (
            <>
              New here?{" "}
              <button type="button" className="login-footer-link" onClick={() => switchTab("signup")}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="login-footer-link" onClick={() => switchTab("signin")}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>

      <div className="login-brand">
        <div className="login-brand-bg" />
        <div className="login-brand-content">
          <div>
            <div className="login-eyebrow">NFL Draft Pool</div>
            <h1 className="login-headline">On the<br />Clock.</h1>
            <p className="login-sub">
              Predict every pick. Compete with your crew.<br />
              Stay in the game even when you step away.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

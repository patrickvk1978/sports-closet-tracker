import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";

function buttonClass(active) {
  return active ? "nav-button chip active" : "nav-button";
}

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const { pool, allPools, switchPool } = usePool();

  const isAdmin     = location.pathname === "/admin";
  const isSettings  = location.pathname === "/pool-settings";
  const isDashboard = location.pathname === "/dashboard";
  const isSeries = location.pathname === "/series";
  const isBracket = location.pathname === "/bracket";
  const isReports = location.pathname === "/reports";
  const isPoolCreator = pool?.admin_id === profile?.id;
  const canSettings   = isPoolCreator || Boolean(profile?.is_admin);

  function goHome() {
    navigate("/dashboard");
  }

  function handlePoolSelect(e) {
    const val = e.target.value;
    if (val === "__join__") navigate("/join");
    else if (val === "__create__") navigate("/create-pool");
    else switchPool(val);
  }

  return (
    <nav className="nav-shell" aria-label="Primary navigation">
      <button className="brand-link" onClick={goHome} aria-label="Go to dashboard">
        <span className="brand-mark">NBA</span>
        <span>NBA Playoff Predictor</span>
      </button>

      <div className="nav-actions">
        <select
          className="nav-select"
          value={pool?.id ?? ""}
          onChange={handlePoolSelect}
          aria-label="Switch pool"
        >
          {allPools.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
          <option disabled value="">──────────</option>
          <option value="__join__">+ Join a Pool</option>
          <option value="__create__">+ Create a Pool</option>
        </select>

        <button
          className={buttonClass(isDashboard)}
          onClick={() => navigate("/dashboard")}
          aria-label="Dashboard"
        >
          Dashboard
        </button>

        <button
          className={buttonClass(isSeries)}
          onClick={() => navigate("/series")}
          aria-label="Series tracker"
        >
          Series
        </button>

        <button
          className={buttonClass(isBracket)}
          onClick={() => navigate("/bracket")}
          aria-label="Bracket workspace"
        >
          Bracket
        </button>

        <button
          className={buttonClass(isReports)}
          onClick={() => navigate("/reports")}
          aria-label="Reports"
        >
          Reports
        </button>

        {canSettings ? (
          <button
            className={buttonClass(isSettings)}
            onClick={() => navigate("/pool-settings")}
            aria-label="Pool settings"
          >
            Settings
          </button>
        ) : null}

        {profile?.is_admin ? (
          <button
            className={buttonClass(isAdmin)}
            onClick={() => navigate("/admin")}
            aria-label="Admin panel"
          >
            Admin
          </button>
        ) : null}

        <button className="nav-button muted" onClick={() => signOut()} aria-label="Sign out">
          Sign out
        </button>
      </div>
    </nav>
  );
}

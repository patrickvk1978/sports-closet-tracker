import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const { pool, allPools, switchPool } = usePool();

  const isAdmin     = location.pathname === "/admin";
  const isSettings  = location.pathname === "/pool-settings";
  const isDashboard = location.pathname === "/dashboard";
  const isTeams = location.pathname === "/teams";
  const isStandings = location.pathname === "/standings";
  const isReports = location.pathname === "/reports" || location.pathname.startsWith("/reports/");
  const isPoolCreator = pool?.admin_id === profile?.id;
  const canSettings   = isPoolCreator || Boolean(profile?.is_admin);

  function handlePoolSelect(e) {
    const val = e.target.value;
    if (val === "__join__") navigate("/join");
    else if (val === "__create__") navigate("/create-pool");
    else switchPool(val);
  }

  return (
    <nav className="nav-shell" aria-label="Primary navigation">
      <a className="brand-link" href="/teams" aria-label="Go to board">
        <span className="brand-mark">NBA</span>
        <span>Playoff Value Board</span>
      </a>

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

        <a className={isTeams ? "nav-button active" : "nav-button"} href="/teams" aria-label="My board">
          My Board
        </a>

        <a className={isDashboard ? "nav-button active" : "nav-button"} href="/dashboard" aria-label="Dashboard">
          Dashboard
        </a>

        <a className={isStandings ? "nav-button active" : "nav-button"} href="/standings" aria-label="Standings">
          Standings
        </a>

        <a className={isReports ? "nav-button active" : "nav-button"} href="/reports" aria-label="Reports">
          Reports
        </a>

        {canSettings ? (
          <a className={isSettings ? "nav-button active" : "nav-button"} href="/pool-settings" aria-label="Pool settings">
            Settings
          </a>
        ) : null}

        {profile?.is_admin ? (
          <a className={isAdmin ? "nav-button active" : "nav-button"} href="/admin" aria-label="Admin panel">
            Admin
          </a>
        ) : null}

        <button type="button" className="nav-button muted" onClick={() => signOut()} aria-label="Sign out">
          Sign out
        </button>
      </div>
    </nav>
  );
}

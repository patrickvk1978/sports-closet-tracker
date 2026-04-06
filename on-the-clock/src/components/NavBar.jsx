import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const { pool, allPools, switchPool } = usePool();

  const isAdmin  = location.pathname === "/admin";
  const isSettings = location.pathname === "/pool-settings";
  const isPoolCreator = pool?.admin_id === profile?.id;

  function goHome() {
    navigate(pool?.game_mode === "mock_challenge" ? "/mock" : "/draft");
  }

  return (
    <nav className="nav-shell" aria-label="Primary navigation">
      <button className="brand-link" onClick={goHome} aria-label="Go to draft view">
        <span className="brand-mark">OTC</span>
        <span>On the Clock</span>
      </button>

      <div className="nav-actions">
        {allPools.length > 0 ? (
          <select
            className="nav-select"
            value={pool?.id ?? ""}
            onChange={(event) => switchPool(event.target.value)}
            aria-label="Switch pool"
          >
            {allPools.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : null}

        <button className="nav-button" onClick={() => navigate("/join")} aria-label="Join a pool">
          Join
        </button>
        <button className="nav-button" onClick={() => navigate("/create-pool")} aria-label="Create a pool">
          Create
        </button>
        {isPoolCreator ? (
          <button
            className={isSettings ? "nav-button chip active" : "nav-button"}
            onClick={() => navigate("/pool-settings")}
            aria-label="Pool settings"
          >
            Settings
          </button>
        ) : null}
        {profile?.is_admin ? (
          <button
            className={isAdmin ? "nav-button chip active" : "nav-button"}
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

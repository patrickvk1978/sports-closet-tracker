import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";

export default function NavBar() {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { pool, allPools, switchPool, seedDemoPools, resetDraftFeed } = usePool();

  async function handleSeedDemo() {
    const result = await seedDemoPools();
    if (result?.pool) {
      navigate(result.pool.game_mode === "mock_challenge" ? "/mock" : "/draft");
    }
  }

  return (
    <div className="nav-shell">
      <button className="brand-link" onClick={() => navigate(pool?.game_mode === "mock_challenge" ? "/mock" : "/draft")}>
        <span className="brand-mark">SC</span>
        <span>On the Clock</span>
      </button>

      <div className="nav-actions">
        <select
          className="nav-select"
          value={pool?.id ?? ""}
          onChange={(event) => switchPool(event.target.value)}
        >
          {allPools.length === 0 ? <option value="">No pools yet</option> : null}
          {allPools.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <button className="nav-button" onClick={() => navigate("/join")}>Join</button>
        <button className="nav-button" onClick={() => navigate("/create-pool")}>Create</button>
        <button className="nav-button" onClick={() => navigate("/pool-settings")}>Settings</button>
        <button className="nav-button" onClick={handleSeedDemo}>Load Demo</button>
        <button className="nav-button" onClick={resetDraftFeed}>Reset Feed</button>
        {profile?.is_admin ? <button className="nav-button" onClick={() => navigate("/admin")}>Admin</button> : null}
        <button className="nav-button muted" onClick={() => signOut()}>Sign out</button>
      </div>
    </div>
  );
}

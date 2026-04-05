import { Navigate, Outlet, useLocation } from "react-router-dom";
import { usePool } from "../hooks/usePool";

export default function PoolGuard() {
  const { pool, isLoading } = usePool();
  const location = useLocation();

  if (isLoading) return <div className="simple-shell">Loading pool…</div>;
  if (!pool) return <Navigate to="/join" replace />;

  const isMock = pool.game_mode === "mock_challenge";
  if (isMock && location.pathname === "/draft") {
    return <Navigate to="/mock" replace />;
  }
  if (!isMock && location.pathname === "/mock") {
    return <Navigate to="/draft" replace />;
  }

  return <Outlet />;
}

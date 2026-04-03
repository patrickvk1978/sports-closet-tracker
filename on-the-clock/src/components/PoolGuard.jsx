import { Navigate, Outlet } from "react-router-dom";
import { usePool } from "../hooks/usePool";

export default function PoolGuard() {
  const { pool, isLoading } = usePool();

  if (isLoading) return <div className="simple-shell">Loading pool…</div>;
  if (!pool) return <Navigate to="/join" replace />;
  return <Outlet />;
}

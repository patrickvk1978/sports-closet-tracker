import { Navigate, Outlet } from 'react-router-dom'
import { usePool } from '@sports/shared/pools'

export default function PoolGuard() {
  const { pool, isLoading } = usePool()

  if (isLoading) return <div className="simple-shell">Loading pool…</div>
  if (!pool) return <Navigate to="/join" replace />
  return <Outlet />
}

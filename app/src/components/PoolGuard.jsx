import { Navigate, Outlet } from 'react-router-dom'
import { usePool } from '../hooks/usePool'

export default function PoolGuard() {
  const { pool, isLoading } = usePool()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-slate-500 text-sm" style={{ fontFamily: 'Space Mono, monospace' }}>
          Loading pool…
        </span>
      </div>
    )
  }

  if (!pool) return <Navigate to="/join" replace />

  return <Outlet />
}

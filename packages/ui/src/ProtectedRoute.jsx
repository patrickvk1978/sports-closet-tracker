import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@sports/shared/auth'

export default function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="simple-shell">Loading…</div>
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

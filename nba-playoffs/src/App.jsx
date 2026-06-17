import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PoolProvider } from "./context/PoolContext";
import { PlayoffDataProvider } from "./hooks/usePlayoffData.jsx";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import JoinPoolPage from "./pages/JoinPoolPage";
import CreatePoolPage from "./pages/CreatePoolPage";
import PoolSettingsPage from "./pages/PoolSettingsPage";
import AdminPage from "./pages/AdminPage";
import PoolMembersPage from "./pages/PoolMembersPage";
import ProtectedRoute from "./components/ProtectedRoute";
import PoolGuard from "./components/PoolGuard";
import NavBar from "./components/NavBar";
import DashboardView from "./views/DashboardView";
import BracketWorkspaceView from "./views/BracketWorkspaceView";
import SeriesTrackerView from "./views/SeriesTrackerView";
import StandingsView from "./views/StandingsView";
import ReportsView from "./views/ReportsView";
import SeriesReportView from "./views/SeriesReportView";
import OpponentReportView from "./views/OpponentReportView";
import { usePool } from "./hooks/usePool";

function AppChrome() {
  return (
    <>
      <NavBar />
      <main className="screen-stack">
        <Outlet />
      </main>
    </>
  );
}

function PoolHomeRedirect() {
  const { pool } = usePool();

  if (!pool) {
    return <Navigate to="/join" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlayoffDataProvider>
        <PoolProvider>
          <div className="app-shell app-shell-routed">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppChrome />}>
                  <Route path="/join" element={<JoinPoolPage />} />
                  <Route path="/create-pool" element={<CreatePoolPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route element={<PoolGuard />}>
                    <Route path="/" element={<PoolHomeRedirect />} />
                    <Route path="/dashboard" element={<DashboardView />} />
                    <Route path="/standings" element={<StandingsView />} />
                    <Route path="/bracket" element={<BracketWorkspaceView />} />
                    <Route path="/series" element={<SeriesTrackerView />} />
                    <Route path="/reports" element={<ReportsView />} />
                    <Route path="/reports/series/:seriesId" element={<SeriesReportView />} />
                    <Route path="/reports/opponent/:opponentId" element={<OpponentReportView />} />
                    <Route path="/pool-settings" element={<PoolSettingsPage />} />
                    <Route path="/pool-members" element={<PoolMembersPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </div>
        </PoolProvider>
        </PlayoffDataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

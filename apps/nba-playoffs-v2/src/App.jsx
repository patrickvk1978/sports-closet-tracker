import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
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
import ScrollToTop from "./components/ScrollToTop";
import TeamsBoardView from "./views/TeamsBoardView";
import TeamValueStandingsView from "./views/TeamValueStandingsView";
import TeamValueDashboardView from "./views/TeamValueDashboardView";
import TeamValueReportsView from "./views/TeamValueReportsView";
import TeamValueReportDetailView from "./views/TeamValueReportDetailView";
import TeamValueScoringView from "./views/TeamValueScoringView";
import TeamValueBoardMatrixView from "./views/TeamValueBoardMatrixView";
import TeamValueBoardCompareView from "./views/TeamValueBoardCompareView";
import TeamValueYesterdayRecapView from "./views/TeamValueYesterdayRecapView";
import { usePool } from "./hooks/usePool";

function AppChrome() {
  const location = useLocation();

  return (
    <>
      <NavBar />
      <main className="screen-stack">
        <Outlet key={location.pathname} />
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
      <ScrollToTop />
      <AuthProvider>
        <PoolProvider>
          <PlayoffDataProvider>
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
                      <Route path="/dashboard" element={<TeamValueDashboardView />} />
                      <Route path="/teams" element={<TeamsBoardView />} />
                      <Route path="/standings" element={<TeamValueStandingsView />} />
                      <Route path="/reports" element={<TeamValueReportsView />} />
                      <Route path="/reports/yesterday-recap" element={<TeamValueYesterdayRecapView />} />
                      <Route path="/reports/:reportKey" element={<TeamValueReportDetailView />} />
                      <Route path="/board-matrix" element={<TeamValueBoardMatrixView />} />
                      <Route path="/board-compare" element={<TeamValueBoardCompareView />} />
                      <Route path="/scoring" element={<TeamValueScoringView />} />
                      <Route path="/pool-settings" element={<PoolSettingsPage />} />
                      <Route path="/pool-members" element={<PoolMembersPage />} />
                    </Route>
                  </Route>
                </Route>
              </Routes>
            </div>
          </PlayoffDataProvider>
        </PoolProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PoolProvider } from "./context/PoolContext";
import { PlayoffDataProvider } from "./hooks/usePlayoffData.jsx";
import ProtectedRoute from "./components/ProtectedRoute";
import PoolGuard from "./components/PoolGuard";
import NavBar from "./components/NavBar";
import ScrollToTop from "./components/ScrollToTop";
import { usePool } from "./hooks/usePool";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const JoinPoolPage = lazy(() => import("./pages/JoinPoolPage"));
const CreatePoolPage = lazy(() => import("./pages/CreatePoolPage"));
const PoolSettingsPage = lazy(() => import("./pages/PoolSettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const PoolMembersPage = lazy(() => import("./pages/PoolMembersPage"));
const TeamsBoardView = lazy(() => import("./views/TeamsBoardView"));
const TeamValueStandingsView = lazy(() => import("./views/TeamValueStandingsView"));
const TeamValueDashboardView = lazy(() => import("./views/TeamValueDashboardView"));
const TeamValueReportsView = lazy(() => import("./views/TeamValueReportsView"));
const TeamValueReportDetailView = lazy(() => import("./views/TeamValueReportDetailView"));
const TeamValueScoringView = lazy(() => import("./views/TeamValueScoringView"));
const TeamValueBoardMatrixView = lazy(() => import("./views/TeamValueBoardMatrixView"));
const TeamValueBoardCompareView = lazy(() => import("./views/TeamValueBoardCompareView"));
const TeamValueYesterdayRecapView = lazy(() => import("./views/TeamValueYesterdayRecapView"));

function RouteLoadingFallback() {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="label">Loading</span>
          <h2>Bringing the page in</h2>
        </div>
      </div>
      <p className="subtle">Pulling in the next view now.</p>
    </section>
  );
}

function AppChrome() {
  return (
    <>
      <NavBar />
      <main className="screen-stack">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Outlet />
        </Suspense>
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

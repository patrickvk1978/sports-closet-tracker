import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PoolProvider } from "./context/PoolContext";
import LoginPage from "./pages/LoginPage";
import JoinPoolPage from "./pages/JoinPoolPage";
import CreatePoolPage from "./pages/CreatePoolPage";
import PoolSettingsPage from "./pages/PoolSettingsPage";
import AdminPage from "./pages/AdminPage";
import ProtectedRoute from "./components/ProtectedRoute";
import PoolGuard from "./components/PoolGuard";
import NavBar from "./components/NavBar";
import LiveDraftView from "./views/LiveDraftView";
import MockChallengeView from "./views/MockChallengeView";
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

  return <Navigate to={pool.game_mode === "mock_challenge" ? "/mock" : "/draft"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PoolProvider>
          <div className="app-shell app-shell-routed">
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/join" element={<JoinPoolPage />} />
                <Route path="/create-pool" element={<CreatePoolPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route element={<AppChrome />}>
                  <Route element={<PoolGuard />}>
                    <Route path="/" element={<PoolHomeRedirect />} />
                    <Route path="/draft" element={<LiveDraftView />} />
                    <Route path="/mock" element={<MockChallengeView />} />
                    <Route path="/pool-settings" element={<PoolSettingsPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </div>
        </PoolProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

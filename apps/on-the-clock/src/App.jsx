import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@sports/shared/auth";
import { supabase } from "./lib/supabase";

function AuthRedirectHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") navigate("/reset-password");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  return null;
}
import { PoolProvider } from "./context/PoolContext";
import { ReferenceDataProvider } from "./hooks/useReferenceData";
import { DraftFeedProvider } from "./hooks/useDraftFeed";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import JoinPoolPage from "./pages/JoinPoolPage";
import CreatePoolPage from "./pages/CreatePoolPage";
import PoolSettingsPage from "./pages/PoolSettingsPage";
import AdminPage from "./pages/AdminPage";
import PoolMembersPage from "./pages/PoolMembersPage";
import ProtectedRoute from "@sports/ui/ProtectedRoute";
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
      <AuthRedirectHandler />
      <AuthProvider>
        <ReferenceDataProvider>
        <DraftFeedProvider>
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
                    <Route path="/draft" element={<LiveDraftView />} />
                    <Route path="/mock" element={<MockChallengeView />} />
                    <Route path="/pool-settings" element={<PoolSettingsPage />} />
                    <Route path="/pool-members" element={<PoolMembersPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </div>
        </PoolProvider>
        </DraftFeedProvider>
        </ReferenceDataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

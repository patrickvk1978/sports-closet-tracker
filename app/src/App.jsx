import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PoolProvider } from "./context/PoolContext";
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/ProtectedRoute";
import PoolGuard from "./components/PoolGuard";
import Dashboard from "./views/DashboardView";
import MatrixView from "./views/MatrixView";
import BracketView from "./views/BracketView";
import LoginPage from "./pages/LoginPage";
import JoinPoolPage from "./pages/JoinPoolPage";
import CreatePoolPage from "./pages/CreatePoolPage";
import BracketSubmitPage from "./pages/BracketSubmitPage";
import AdminPage from "./pages/AdminPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ReportsHomeView from "./views/ReportsHomeView";
import ReportsRootingView from "./views/ReportsRootingView";
import ReportsHeadToHeadView from "./views/ReportsHeadToHeadView";
import ReportsDependencyView from "./views/ReportsDependencyView";
import ReportsFinishOutcomesView from "./views/ReportsFinishOutcomesView";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PoolProvider>
          <div
            className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col"
            style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}
          >
            <NavBar />
            <div className="flex-1">
              <Routes>
                {/* Public */}
                <Route path="/login"          element={<LoginPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                {/* Requires auth */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/join"        element={<JoinPoolPage />} />
                  <Route path="/create-pool" element={<CreatePoolPage />} />
                  <Route path="/admin"       element={<AdminPage />} />

                  {/* Requires pool membership */}
                  <Route element={<PoolGuard />}>
                    <Route path="/"       element={<Dashboard />} />
                    <Route path="/matrix" element={<MatrixView />} />
                    <Route path="/bracket"element={<BracketView />} />
                    <Route path="/submit"   element={<BracketSubmitPage />} />
                    <Route path="/reports"          element={<ReportsHomeView />} />
                    <Route path="/reports/rooting" element={<ReportsRootingView />} />
                    <Route path="/reports/head-to-head" element={<ReportsHeadToHeadView />} />
                    <Route path="/reports/dependency"   element={<ReportsDependencyView />} />
                    <Route path="/reports/finish-outcomes" element={<ReportsFinishOutcomesView />} />
                  </Route>
                </Route>
              </Routes>
            </div>
            <footer className="text-slate-600 text-xs text-center py-3 border-t border-slate-800/40">
              Scores via ESPN
            </footer>
          </div>
        </PoolProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

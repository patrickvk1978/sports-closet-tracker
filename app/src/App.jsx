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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PoolProvider>
          <div
            className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white"
            style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}
          >
            <NavBar />
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Requires auth */}
              <Route element={<ProtectedRoute />}>
                <Route path="/join"        element={<JoinPoolPage />} />
                <Route path="/create-pool" element={<CreatePoolPage />} />

                {/* Requires pool membership */}
                <Route element={<PoolGuard />}>
                  <Route path="/"       element={<Dashboard />} />
                  <Route path="/matrix" element={<MatrixView />} />
                  <Route path="/bracket"element={<BracketView />} />
                  <Route path="/submit" element={<BracketSubmitPage />} />
                </Route>
              </Route>
            </Routes>
          </div>
        </PoolProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

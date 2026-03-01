import { BrowserRouter, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Dashboard from "./views/DashboardView";
import MatrixView from "./views/MatrixView";
import BracketView from "./views/BracketView";

export default function App() {
  return (
    <BrowserRouter>
      <div
        className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white"
        style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}
      >
        <NavBar />
        <Routes>
          <Route path="/"        element={<Dashboard />} />
          <Route path="/matrix"  element={<MatrixView />} />
          <Route path="/bracket" element={<BracketView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

import { Link, Navigate, Route, Routes } from "react-router";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/">
          Fly Me to the Moon
        </Link>
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/search">Search</Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

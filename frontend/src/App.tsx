import { Navigate, Route, Routes } from "react-router";
import { SiteHeader } from "./components/SiteHeader";
import { SkipLink } from "./components/SkipLink";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";

export function App() {
  return (
    <>
      <SkipLink />
      <div className="app-shell">
        <SiteHeader />
        <main id="main-content" className="app-main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

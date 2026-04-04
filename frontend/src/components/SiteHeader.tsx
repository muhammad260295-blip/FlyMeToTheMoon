import { Link } from "react-router";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-header__brand" to="/">
          Fly Me to the Moon
        </Link>
        <nav aria-label="Primary" className="site-header__nav">
          <ul className="site-header__list">
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/search">Search</Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

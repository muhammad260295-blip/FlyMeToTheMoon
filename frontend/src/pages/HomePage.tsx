import { Link } from "react-router";

export function HomePage() {
  return (
    <section className="page">
      <h1>Welcome</h1>
      <p className="lede">
        This app demonstrates the search API: a shared contract, a stub backend,
        and a React UI with loading and empty states.
      </p>
      <p>
        <Link className="button" to="/search">
          Open search
        </Link>
      </p>
    </section>
  );
}

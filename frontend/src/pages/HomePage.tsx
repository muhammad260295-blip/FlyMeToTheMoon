import { ButtonLink } from "../components/ButtonLink";

export function HomePage() {
  return (
    <article className="page" aria-labelledby="home-heading">
      <header className="page__header">
        <h1 id="home-heading">Welcome</h1>
        <p className="page__lede">
          Search round-trip itineraries via SerpAPI (Google Flights) on the
          server—your API key stays on the backend. Set places, an outbound date
          window, and trip length; results show cheapest and best options.
        </p>
      </header>
      <p>
        <ButtonLink to="/search">Search flights</ButtonLink>
      </p>
    </article>
  );
}

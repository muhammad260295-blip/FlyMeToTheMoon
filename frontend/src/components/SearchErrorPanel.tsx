import { getFriendlySearchError } from "../api/searchErrorCopy";
import type { SearchApiError } from "../api/searchClient";

type Props = {
  error: SearchApiError;
  onRetry: () => void;
};

export function SearchErrorPanel({ error, onRetry }: Props) {
  const { title, detail } = getFriendlySearchError(error);

  return (
    <section
      className="error-panel"
      role="alert"
      aria-labelledby="search-error-title"
    >
      <h2 id="search-error-title" className="error-panel__title">
        {title}
      </h2>
      <p className="error-panel__detail">{detail}</p>
      <button type="button" className="error-panel__retry" onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}

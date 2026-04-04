type Props = {
  /** Number of placeholder rows (default 5). */
  rows?: number;
};

/**
 * Visual loading placeholders for the results list. Paired with a screen-reader
 * status elsewhere so this region stays `aria-hidden`.
 */
export function SearchResultsSkeleton({ rows = 5 }: Props) {
  return (
    <section className="skeleton-results" aria-hidden="true">
      <div className="skeleton-results__header skeleton-shimmer" />
      <ul className="skeleton-results__list">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="skeleton-card">
            <div className="skeleton-card__line skeleton-card__line--title skeleton-shimmer" />
            <div className="skeleton-card__line skeleton-card__line--desc skeleton-shimmer" />
          </li>
        ))}
      </ul>
      <div
        className="skeleton-results__header skeleton-shimmer"
        style={{ marginTop: "1rem" }}
      />
      <ul className="skeleton-results__list">
        {Array.from({ length: Math.min(rows, 3) }, (_, i) => (
          <li key={`b-${i}`} className="skeleton-card">
            <div className="skeleton-card__line skeleton-card__line--title skeleton-shimmer" />
            <div className="skeleton-card__line skeleton-card__line--desc skeleton-shimmer" />
          </li>
        ))}
      </ul>
    </section>
  );
}

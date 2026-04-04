import type { Itinerary } from "@fly/contracts";

function ItineraryCard({
  itin,
  index,
  prefix,
}: {
  itin: Itinerary;
  index: number;
  prefix: string;
}) {
  const titleId = `${prefix}-itin-${index}-title`;
  const legSummary = itin.legs
    .map(
      (l) =>
        `${l.departure.code ?? "?"}→${l.arrival.code ?? "?"}${l.flightNumber ? ` (${l.flightNumber})` : ""}`,
    )
    .join(" · ");

  return (
    <article className="itinerary-card" aria-labelledby={titleId}>
      <h3 id={titleId} className="itinerary-card__title">
        <span className="itinerary-card__index">{index + 1}.</span>{" "}
        {itin.currency} {itin.totalPrice}
        <span className="itinerary-card__dates">
          {" "}
          ·{" "}
          {itin.returnDate
            ? `${itin.outboundDate} → ${itin.returnDate}`
            : itin.outboundDate}
        </span>
      </h3>
      <p className="itinerary-card__meta">
        {itin.provider}
        {itin.stopsOutbound !== undefined
          ? ` · Out ${itin.stopsOutbound === 0 ? "nonstop" : `${itin.stopsOutbound} stop(s)`}`
          : null}
        {itin.stopsReturn !== undefined
          ? ` · Ret ${itin.stopsReturn === 0 ? "nonstop" : `${itin.stopsReturn} stop(s)`}`
          : null}
        {itin.totalDurationMinutes != null
          ? ` · ~${Math.round(itin.totalDurationMinutes / 60)}h total`
          : null}
      </p>
      <p className="itinerary-card__legs">{legSummary}</p>
      {itin.bookingUrl ? (
        <p className="itinerary-card__book">
          <a
            className="itinerary-card__link"
            href={itin.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View on Google Flights, opens in a new tab, ${itin.currency} ${itin.totalPrice}`}
          >
            View on Google Flights
          </a>
        </p>
      ) : null}
    </article>
  );
}

function ItineraryList({
  title,
  id,
  items,
  prefix,
}: {
  title: string;
  id: string;
  items: Itinerary[];
  prefix: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="itinerary-section" aria-labelledby={id}>
      <h2 id={id} className="itinerary-section__heading">
        {title}
      </h2>
      <ol className="itinerary-section__list">
        {items.map((itin, index) => (
          <li key={itin.id} className="itinerary-section__item">
            <ItineraryCard itin={itin} index={index} prefix={prefix} />
          </li>
        ))}
      </ol>
    </section>
  );
}

type Props = {
  cheapest: Itinerary[];
  best: Itinerary[];
  /** Server-computed copy: weighted “Best” vs price-only “Cheapest”. */
  bestRankingExplanation?: string;
};

export function ItineraryResults({
  cheapest,
  best,
  bestRankingExplanation,
}: Props) {
  return (
    <div
      className="itinerary-results"
      role="region"
      aria-label="Flight search results"
    >
      {bestRankingExplanation ? (
        <p className="itinerary-results__ranking-note">{bestRankingExplanation}</p>
      ) : null}
      <ItineraryList
        id="cheapest-heading"
        title="Cheapest"
        items={cheapest}
        prefix="ch"
      />
      <ItineraryList
        id="best-heading"
        title="Best"
        items={best}
        prefix="be"
      />
    </div>
  );
}

import type { TripType } from "@fly/contracts";

type Props = {
  tripType: TripType;
  origin: string;
  destination: string;
  outboundStart: string;
  outboundEnd: string;
  /** Omitted for one-way. */
  tripLengthDays?: number;
};

export function EmptyResults({
  tripType,
  origin,
  destination,
  outboundStart,
  outboundEnd,
  tripLengthDays,
}: Props) {
  const kind =
    tripType === "one_way"
      ? "one-way"
      : tripType === "open_jaw"
        ? "open-jaw"
        : "round-trip";

  return (
    <section
      className="empty-results"
      aria-labelledby="empty-results-title"
      role="status"
      aria-live="polite"
    >
      <h2 id="empty-results-title" className="empty-results__title">
        No itineraries found
      </h2>
      <p className="empty-results__body">
        No {kind} offers matched{" "}
        <strong>
          {origin} → {destination}
        </strong>
        , departure window <strong>{outboundStart}</strong>–
        <strong>{outboundEnd}</strong>
        {tripLengthDays !== undefined ? (
          <>
            , <strong>{tripLengthDays}</strong> day trip length
          </>
        ) : null}
        . Try different places, a wider date range
        {tripType === "one_way" ? "" : ", trip length,"} or filters.
      </p>
    </section>
  );
}

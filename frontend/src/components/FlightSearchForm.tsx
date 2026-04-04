import { FormEvent, useId } from "react";
import type { TripType } from "@fly/contracts";
import { PlaceField } from "./PlaceField";

export type FlightFieldValues = {
  tripType: TripType;
  origin: string;
  destination: string;
  returnFrom: string;
  returnFromPlaceId: string;
  originPlaceId: string;
  destinationPlaceId: string;
  dateStart: string;
  dateEnd: string;
  tripLengthDays: string;
  directOnly: boolean;
};

export type FlightSearchFormProps = {
  formId: string;
  values: FlightFieldValues;
  onChange: (patch: Partial<FlightFieldValues>) => void;
  onSubmitFlight: () => void;
  onReset: () => void;
  isLoading: boolean;
  validationMessage: string | null;
  onClearValidation: () => void;
};

const TRIP_OPTIONS: { value: TripType; label: string; hint: string }[] = [
  {
    value: "round_trip",
    label: "Round trip",
    hint: "Return to your origin city. Uses trip length for the return date.",
  },
  {
    value: "one_way",
    label: "One way",
    hint: "Outbound flights only, across your departure date window.",
  },
  {
    value: "open_jaw",
    label: "Open jaw",
    hint: "Fly into one city and back from another (return leg ends at home).",
  },
];

export function FlightSearchForm({
  formId,
  values,
  onChange,
  onSubmitFlight,
  onReset,
  isLoading,
  validationMessage,
  onClearValidation,
}: FlightSearchFormProps) {
  const oid = `${formId}-origin`;
  const did = `${formId}-destination`;
  const rid = `${formId}-return-from`;
  const ds = `${formId}-date-start`;
  const de = `${formId}-date-end`;
  const tripId = `${formId}-trip`;
  const routeLegendId = `${formId}-route-legend`;
  const datesLegendId = `${formId}-dates-legend`;
  const rangeHintId = `${formId}-range-hint`;
  const tripHintId = `${formId}-trip-hint`;
  const formHintId = `${formId}-hint`;
  const errorId = `${formId}-error`;
  const directId = `${formId}-direct`;

  const tripFieldHintId = useId();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmitFlight();
  };

  const onStartChange = (nextStart: string) => {
    let nextEnd = values.dateEnd;
    if (nextStart) {
      if (!nextEnd) {
        nextEnd = nextStart;
      } else if (nextStart > nextEnd) {
        nextEnd = nextStart;
      }
    }
    const patch: Partial<FlightFieldValues> = { dateStart: nextStart };
    if (nextEnd !== values.dateEnd) patch.dateEnd = nextEnd;
    onChange(patch);
    if (validationMessage) onClearValidation();
  };

  const onEndChange = (nextEnd: string) => {
    onChange({ dateEnd: nextEnd });
    if (validationMessage) onClearValidation();
  };

  const describedBy = [formHintId, validationMessage ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const validationDescribedBy = validationMessage ? errorId : undefined;
  const invalid = Boolean(validationMessage);
  const tripLen = Number.parseInt(values.tripLengthDays.trim(), 10);
  const tripOk = Number.isFinite(tripLen) && tripLen >= 1;
  const tripDaysLabel = tripOk ? String(tripLen) : "…";
  const tripNightsLabel = tripOk ? String(Math.max(0, tripLen - 1)) : "…";

  const showTripLength =
    values.tripType === "round_trip" || values.tripType === "open_jaw";
  const showReturnFrom = values.tripType === "open_jaw";

  return (
    <form
      className="flight-search-form"
      role="search"
      aria-label="Flight search"
      aria-busy={isLoading}
      aria-describedby={describedBy || undefined}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="flight-search-form__sections">
        <fieldset className="flight-search-form__fieldset">
          <legend className="flight-search-form__legend">Trip type</legend>
          <div
            className="flight-search-form__trip-type-grid"
            role="radiogroup"
            aria-label="Trip type"
          >
            {TRIP_OPTIONS.map((opt) => {
              const tid = `${formId}-tt-${opt.value}`;
              return (
                <label key={opt.value} className="flight-search-form__trip-type-option">
                  <input
                    id={tid}
                    type="radio"
                    name={`${formId}-tripType`}
                    value={opt.value}
                    checked={values.tripType === opt.value}
                    disabled={isLoading}
                    onChange={() => {
                      onChange({ tripType: opt.value });
                      if (validationMessage) onClearValidation();
                    }}
                  />
                  <span className="flight-search-form__trip-type-label">
                    <span className="flight-search-form__trip-type-title">
                      {opt.label}
                    </span>
                    <span className="flight-search-form__trip-type-hint">
                      {opt.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset
          className="flight-search-form__fieldset"
          aria-labelledby={routeLegendId}
          aria-describedby={`${formId}-route-desc`}
        >
          <legend id={routeLegendId} className="flight-search-form__legend">
            Route
          </legend>
          <p id={`${formId}-route-desc`} className="flight-search-form__section-lede">
            {showReturnFrom
              ? "Outbound: home to first city. Then set where the return flight departs (not the same as your outbound destination)."
              : "Origin and destination. Choose a suggestion so the server can resolve airports or cities."}
          </p>
          <div className="flight-search-form__route-row">
            <PlaceField
              id={oid}
              label="From"
              value={values.origin}
              placeId={values.originPlaceId}
              disabled={isLoading}
              required
              invalid={invalid}
              validationId={validationDescribedBy}
              onChange={(next) => {
                onChange({
                  origin: next.text,
                  originPlaceId: next.placeId,
                });
                if (validationMessage) onClearValidation();
              }}
            />
            <PlaceField
              id={did}
              label="To"
              value={values.destination}
              placeId={values.destinationPlaceId}
              disabled={isLoading}
              required
              invalid={invalid}
              validationId={validationDescribedBy}
              onChange={(next) => {
                onChange({
                  destination: next.text,
                  destinationPlaceId: next.placeId,
                });
                if (validationMessage) onClearValidation();
              }}
            />
          </div>
          {showReturnFrom ? (
            <div className="flight-search-form__route-row flight-search-form__route-row--return">
              <PlaceField
                id={rid}
                label="Return from"
                value={values.returnFrom}
                placeId={values.returnFromPlaceId}
                disabled={isLoading}
                required
                invalid={invalid}
                validationId={validationDescribedBy}
                onChange={(next) => {
                  onChange({
                    returnFrom: next.text,
                    returnFromPlaceId: next.placeId,
                  });
                  if (validationMessage) onClearValidation();
                }}
              />
            </div>
          ) : null}
        </fieldset>

        <fieldset
          className="flight-search-form__fieldset"
          aria-labelledby={datesLegendId}
        >
          <legend id={datesLegendId} className="flight-search-form__legend">
            {values.tripType === "one_way"
              ? "Departure date range"
              : "Outbound date range"}
          </legend>
          <p id={rangeHintId} className="flight-search-form__section-lede">
            {values.tripType === "one_way"
              ? "Includes each departure day in the window (one-way pricing per day)."
              : "Flexible departure window. The search includes each departure day in the range; trip length sets the return (or second-leg) date for each option."}
          </p>
          <div className="flight-search-form__date-row">
            <div className="flight-search-form__field">
              <label className="flight-search-form__label" htmlFor={ds}>
                Earliest departure
              </label>
              <input
                id={ds}
                name="dateStart"
                type="date"
                className="flight-search-form__input"
                value={values.dateStart}
                max={values.dateEnd || undefined}
                aria-invalid={invalid || undefined}
                aria-required
                aria-describedby={rangeHintId}
                disabled={isLoading}
                onChange={(e) => onStartChange(e.target.value)}
              />
            </div>
            <div className="flight-search-form__field">
              <label className="flight-search-form__label" htmlFor={de}>
                Latest departure
              </label>
              <input
                id={de}
                name="dateEnd"
                type="date"
                className="flight-search-form__input"
                value={values.dateEnd}
                min={values.dateStart || undefined}
                aria-invalid={invalid || undefined}
                aria-required
                aria-describedby={rangeHintId}
                disabled={isLoading}
                onChange={(e) => onEndChange(e.target.value)}
              />
            </div>
          </div>
        </fieldset>

        <div className="flight-search-form__options-row">
          <div className="flight-search-form__field flight-search-form__field--checkbox">
            <input
              id={directId}
              type="checkbox"
              className="flight-search-form__checkbox"
              checked={values.directOnly}
              disabled={isLoading}
              onChange={(e) => {
                onChange({ directOnly: e.target.checked });
                if (validationMessage) onClearValidation();
              }}
            />
            <label className="flight-search-form__checkbox-label" htmlFor={directId}>
              Direct flights only (nonstop)
            </label>
          </div>
        </div>

        <div className="flight-search-form__trip-submit">
          {showTripLength ? (
            <div className="flight-search-form__field flight-search-form__field--trip">
              <label className="flight-search-form__label" htmlFor={tripId}>
                Trip length (days)
              </label>
              <input
                id={tripId}
                name="tripLengthDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                className="flight-search-form__input"
                value={values.tripLengthDays}
                aria-invalid={invalid || undefined}
                aria-required
                aria-describedby={`${tripHintId} ${tripFieldHintId}`}
                disabled={isLoading}
                onChange={(e) => {
                  onChange({ tripLengthDays: e.target.value });
                  if (validationMessage) onClearValidation();
                }}
              />
              <p id={tripHintId} className="flight-search-form__field-hint">
                Inclusive calendar days: departure is day 1; second leg departs
                on day {tripDaysLabel} ({tripNightsLabel} nights away).
              </p>
              <p id={tripFieldHintId} className="sr-only">
                Whole days from outbound departure through return or second-leg
                departure, including both travel days.
              </p>
            </div>
          ) : (
            <div className="flight-search-form__field flight-search-form__field--trip flight-search-form__field--placeholder" />
          )}
          <div className="flight-search-form__actions">
            <div className="flight-search-form__submit-wrap">
              <button
                type="submit"
                className="flight-search-form__submit"
                disabled={isLoading}
              >
                {isLoading ? "Searching…" : "Search flights"}
              </button>
            </div>
            <button
              type="button"
              className="flight-search-form__reset"
              disabled={isLoading}
              title={
                isLoading
                  ? "Unavailable while searching — refresh the page to cancel the request"
                  : "Clear form, results, banners, and URL"
              }
              onClick={onReset}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <p id={formHintId} className="flight-search-form__hint">
        Cheapest and Best lists follow server rules (price-only vs weighted score).
        Open jaw uses multi-city routing; one-way searches omit a return leg.
        Direct-only requests nonstop legs; segment counts follow parsed results.
      </p>
      {validationMessage ? (
        <p id={errorId} className="flight-search-form__error" role="alert">
          {validationMessage}
        </p>
      ) : null}
    </form>
  );
}

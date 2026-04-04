import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { PlaceCandidate } from "@fly/contracts";
import {
  type FlightSearchRequest,
  type FlightSearchResponse,
  isValidIsoDateString,
} from "@fly/contracts";
import { EmptyResults } from "../components/EmptyResults";
import {
  FlightSearchForm,
  type FlightFieldValues,
} from "../components/FlightSearchForm";
import { PlaceAmbiguityModal } from "../components/PlaceAmbiguityModal";
import { SearchErrorPanel } from "../components/SearchErrorPanel";
import { ItineraryResults } from "../components/ItineraryResults";
import { SearchResultsSkeleton } from "../components/SearchResultsSkeleton";
import { clearSearchCache } from "../api/searchCache";
import {
  isSearchApiError,
  normalizeSearchError,
  postSearch,
  type SearchApiError,
} from "../api/searchClient";

type ViewState =
  | { kind: "idle" }
  | { kind: "loading"; request: FlightSearchRequest }
  | { kind: "ready"; request: FlightSearchRequest; data: FlightSearchResponse }
  | { kind: "error"; request: FlightSearchRequest; error: SearchApiError };

type AmbiguousField = "origin" | "destination" | "returnFrom";

type AmbiguousState = {
  field: AmbiguousField;
  candidates: PlaceCandidate[];
  request: FlightSearchRequest;
};

const SEARCH_FORM_ID = "flight-search";
const DEFAULT_LIMIT = 20;

const DEFAULT_FIELDS: FlightFieldValues = {
  tripType: "round_trip",
  origin: "",
  destination: "",
  returnFrom: "",
  returnFromPlaceId: "",
  originPlaceId: "",
  destinationPlaceId: "",
  dateStart: "",
  dateEnd: "",
  tripLengthDays: "7",
  directOnly: false,
};

function isPlaceAmbiguousBody(
  body: unknown,
): body is {
  error: string;
  field: AmbiguousField;
  candidates: PlaceCandidate[];
} {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    b.error === "place_ambiguous" &&
    (b.field === "origin" ||
      b.field === "destination" ||
      b.field === "returnFrom") &&
    Array.isArray(b.candidates)
  );
}

function validateFlightFields(fields: FlightFieldValues): string | null {
  const origin = fields.origin.trim();
  const destination = fields.destination.trim();
  const dateStart = fields.dateStart.trim();
  const dateEnd = fields.dateEnd.trim();

  if (!origin || !destination || !dateStart || !dateEnd) return null;

  if (!isValidIsoDateString(dateStart) || !isValidIsoDateString(dateEnd)) {
    return "Use real calendar dates (YYYY-MM-DD).";
  }
  if (dateStart > dateEnd) {
    return "Earliest departure must be on or before latest departure.";
  }

  if (fields.tripType === "round_trip" || fields.tripType === "open_jaw") {
    const tripRaw = Number.parseInt(fields.tripLengthDays.trim(), 10);
    if (!Number.isFinite(tripRaw) || tripRaw < 1) {
      return "Trip length must be at least 1 day.";
    }
    if (tripRaw > 365) {
      return "Trip length cannot exceed 365 days.";
    }
  }

  if (fields.tripType === "open_jaw") {
    const rf = fields.returnFrom.trim();
    if (rf.length < 2) {
      return "Enter where the return flight departs from (open jaw).";
    }
  }

  return null;
}

function buildRequest(fields: FlightFieldValues): FlightSearchRequest | null {
  const origin = fields.origin.trim();
  const destination = fields.destination.trim();
  const dateStart = fields.dateStart.trim();
  const dateEnd = fields.dateEnd.trim();
  if (!origin || !destination || !dateStart || !dateEnd) return null;

  const err = validateFlightFields(fields);
  if (err) return null;

  const common = {
    origin,
    destination,
    outboundDateRange: { start: dateStart, end: dateEnd },
    directOnly: fields.directOnly,
    adults: 1 as const,
    limit: DEFAULT_LIMIT,
  };
  const op = fields.originPlaceId.trim();
  const dp = fields.destinationPlaceId.trim();

  if (fields.tripType === "one_way") {
    const req: FlightSearchRequest = {
      tripType: "one_way",
      ...common,
    };
    if (op) req.originPlaceId = op;
    if (dp) req.destinationPlaceId = dp;
    return req;
  }

  const tripRaw = Number.parseInt(fields.tripLengthDays.trim(), 10);

  if (fields.tripType === "round_trip") {
    const req: FlightSearchRequest = {
      tripType: "round_trip",
      ...common,
      tripLengthDays: tripRaw,
    };
    if (op) req.originPlaceId = op;
    if (dp) req.destinationPlaceId = dp;
    return req;
  }

  const rfp = fields.returnFromPlaceId.trim();
  const req: FlightSearchRequest = {
    tripType: "open_jaw",
    ...common,
    tripLengthDays: tripRaw,
    returnFrom: fields.returnFrom.trim(),
  };
  if (op) req.originPlaceId = op;
  if (dp) req.destinationPlaceId = dp;
  if (rfp) req.returnFromPlaceId = rfp;
  return req;
}

export function SearchPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<FlightFieldValues>(DEFAULT_FIELDS);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, setState] = useState<ViewState>({ kind: "idle" });
  const [ambiguous, setAmbiguous] = useState<AmbiguousState | null>(null);
  /** Bumps on each new search and on Reset so late responses never update stale UI. */
  const seqRef = useRef(0);
  /** Aborts the active `postSearch` when Reset runs or a newer search supersedes. */
  const searchAbortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (req: FlightSearchRequest) => {
    searchAbortRef.current?.abort();
    const ac = new AbortController();
    searchAbortRef.current = ac;
    const seq = (seqRef.current += 1);
    setState({ kind: "loading", request: req });
    try {
      const data = await postSearch(req, { signal: ac.signal });
      if (seq !== seqRef.current) return;
      setState({ kind: "ready", request: req, data });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (seq !== seqRef.current) return;
      const err = normalizeSearchError(e);
      if (
        isSearchApiError(err) &&
        err.status === 422 &&
        isPlaceAmbiguousBody(err.body)
      ) {
        setState({ kind: "idle" });
        setAmbiguous({
          field: err.body.field,
          candidates: err.body.candidates as PlaceCandidate[],
          request: req,
        });
        return;
      }
      setState({ kind: "error", request: req, error: err });
    } finally {
      if (searchAbortRef.current === ac) searchAbortRef.current = null;
    }
  }, []);

  const handleSubmitFlight = () => {
    const syncErr = validateFlightFields(fields);
    const o = fields.origin.trim();
    const d = fields.destination.trim();
    const ds = fields.dateStart.trim();
    const de = fields.dateEnd.trim();

    if (!o || !d || !ds || !de) {
      setClientError(
        "Enter origin, destination, and departure date range.",
      );
      return;
    }
    if (syncErr) {
      setClientError(syncErr);
      return;
    }

    const req = buildRequest(fields);
    if (!req) {
      setClientError("Check your trip type, places, and dates.");
      return;
    }

    setClientError(null);
    void runSearch(req);
  };

  const handleReset = () => {
    searchAbortRef.current?.abort();
    seqRef.current += 1;
    clearSearchCache();
    setFields({ ...DEFAULT_FIELDS });
    setClientError(null);
    setAmbiguous(null);
    setState({ kind: "idle" });
    navigate("/search", { replace: true });
  };

  const handleSearchRetry = () => {
    if (state.kind !== "error") return;
    void runSearch(state.request);
  };

  const handleAmbiguousPick = (placeId: string) => {
    if (!ambiguous) return;
    const { field, request, candidates } = ambiguous;
    const cand = candidates.find((c) => c.placeId === placeId);
    const label = cand?.label ?? "";

    const nextReq: FlightSearchRequest = { ...request };
    if (field === "origin") {
      nextReq.origin = label;
      nextReq.originPlaceId = placeId;
    } else if (field === "destination") {
      nextReq.destination = label;
      nextReq.destinationPlaceId = placeId;
    } else if (field === "returnFrom" && nextReq.tripType === "open_jaw") {
      nextReq.returnFrom = label;
      nextReq.returnFromPlaceId = placeId;
    }

    setAmbiguous(null);
    setFields((f) => {
      if (field === "origin") {
        return { ...f, origin: label, originPlaceId: placeId };
      }
      if (field === "destination") {
        return { ...f, destination: label, destinationPlaceId: placeId };
      }
      return { ...f, returnFrom: label, returnFromPlaceId: placeId };
    });
    void runSearch(nextReq);
  };

  const handleAmbiguousDismiss = () => {
    setAmbiguous(null);
    setState({ kind: "idle" });
  };

  const loadingRequest = state.kind === "loading" ? state.request : null;

  const hasResults =
    state.kind === "ready" &&
    (state.data.cheapest.length > 0 || state.data.best.length > 0);

  const isEmpty =
    state.kind === "ready" &&
    state.data.cheapest.length === 0 &&
    state.data.best.length === 0;

  const ambiguityLabel =
    ambiguous?.field === "origin"
      ? "From"
      : ambiguous?.field === "destination"
        ? "To"
        : "Return from";

  return (
    <article className="page search-page" aria-labelledby="search-heading">
      <header className="page__header">
        <h1 id="search-heading">Search flights</h1>
      </header>

      <FlightSearchForm
        formId={SEARCH_FORM_ID}
        values={fields}
        onChange={(patch) => {
          setFields((f) => {
            const next: FlightFieldValues = { ...f, ...patch };
            if (patch.tripType === "one_way") {
              next.returnFrom = "";
              next.returnFromPlaceId = "";
            }
            if (patch.tripType === "round_trip") {
              next.returnFrom = "";
              next.returnFromPlaceId = "";
            }
            return next;
          });
        }}
        onSubmitFlight={handleSubmitFlight}
        onReset={handleReset}
        isLoading={state.kind === "loading"}
        validationMessage={clientError}
        onClearValidation={() => setClientError(null)}
      />

      {ambiguous ? (
        <PlaceAmbiguityModal
          fieldLabel={ambiguityLabel}
          candidates={ambiguous.candidates}
          onPick={handleAmbiguousPick}
          onDismiss={handleAmbiguousDismiss}
        />
      ) : null}

      {loadingRequest ? (
        <>
          <p
            className="search-status search-status--loading"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            Searching{" "}
            {loadingRequest.tripType === "one_way"
              ? "one-way"
              : loadingRequest.tripType === "open_jaw"
                ? "open-jaw"
                : "round-trip"}{" "}
            flights: {loadingRequest.origin} to {loadingRequest.destination}
            {loadingRequest.tripType === "open_jaw"
              ? `, return from ${loadingRequest.returnFrom}`
              : ""}
            , departures {loadingRequest.outboundDateRange.start}–
            {loadingRequest.outboundDateRange.end}
            {loadingRequest.tripType === "one_way"
              ? "."
              : `, ${loadingRequest.tripLengthDays} day trip length.`}
          </p>
          <SearchResultsSkeleton />
        </>
      ) : null}

      {state.kind === "ready" ? (
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          Results ready. {state.data.cheapest.length} cheapest,{" "}
          {state.data.best.length} best itineraries.{" "}
          {state.data.totalOffers} offers scanned.
        </p>
      ) : null}

      {state.kind === "error" ? (
        <SearchErrorPanel error={state.error} onRetry={handleSearchRetry} />
      ) : null}

      {state.kind === "ready" && state.data.meta?.note ? (
        <p className="search-meta-note">{state.data.meta.note}</p>
      ) : null}

      {state.kind === "ready" && isEmpty ? (
        <EmptyResults
          tripType={state.request.tripType}
          origin={state.request.origin}
          destination={state.request.destination}
          outboundStart={state.request.outboundDateRange.start}
          outboundEnd={state.request.outboundDateRange.end}
          tripLengthDays={
            state.request.tripType === "one_way"
              ? undefined
              : state.request.tripLengthDays
          }
        />
      ) : null}

      {state.kind === "ready" && hasResults ? (
        <ItineraryResults
          cheapest={state.data.cheapest}
          best={state.data.best}
          bestRankingExplanation={state.data.meta?.bestRankingExplanation}
        />
      ) : null}
    </article>
  );
}

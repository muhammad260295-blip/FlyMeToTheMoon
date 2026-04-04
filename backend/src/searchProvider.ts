import { createHash } from "node:crypto";
import type {
  BestWeights,
  FlightLeg,
  FlightSearchRequest,
  FlightSearchResponse,
  Itinerary,
  TripType,
} from "@fly/contracts";
import { FlightSearchResponseSchema } from "@fly/contracts";
import { getOrFetchGoogleFlightsJson } from "./serpapiCache.js";
import type { GoogleFlightsParams } from "./serpapi.js";

type GFAirport = { id?: string; name?: string; time?: string };
type GFSegment = {
  departure_airport?: GFAirport;
  arrival_airport?: GFAirport;
  duration?: number;
  airline?: string;
  flight_number?: string;
};
type GFOffer = {
  flights?: GFSegment[];
  price?: number;
  total_duration?: number;
  departure_token?: string;
};

type GFResponse = {
  search_parameters?: { currency?: string };
  search_metadata?: { google_flights_url?: string };
  best_flights?: GFOffer[];
  other_flights?: GFOffer[];
};

type EnrichedOffer = {
  offer: GFOffer;
  tripType: TripType;
  outboundDate: string;
  returnDate?: string;
  bookingUrl?: string;
  currency: string;
  destinationId: string;
  returnOriginId?: string;
  originId?: string;
  providerFallback: string;
};

function toSerpPlaceId(s: string): string {
  const t = s.trim();
  if (t.length === 3 && /^[A-Za-z]{3}$/.test(t)) return t.toUpperCase();
  return t;
}

function addCalendarDays(iso: string, daysToAdd: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + daysToAdd);
  return dt.toISOString().slice(0, 10);
}

function parseIsoUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function enumerateIsoDatesInclusive(start: string, end: string): string[] {
  const a = parseIsoUtc(start);
  const b = parseIsoUtc(end);
  if (a.getTime() > b.getTime()) return [];
  const out: string[] = [];
  const cur = new Date(a.getTime());
  while (cur.getTime() <= b.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function maxOutboundDates(): number {
  const n = Number(process.env.FLIGHT_SEARCH_MAX_OUTBOUND_DATES);
  if (Number.isFinite(n) && n >= 1 && n <= 366) return Math.floor(n);
  return 21;
}

function fetchConcurrency(): number {
  const n = Number(process.env.FLIGHT_SEARCH_CONCURRENCY);
  if (Number.isFinite(n) && n >= 1 && n <= 16) return Math.floor(n);
  return 4;
}

/**
 * SerpAPI Google Flights: `stops=1` requests nonstop segments; `0` allows connections.
 * Upstream can still mislabel rare itineraries — we do not hard-guarantee segment splits.
 */
function stopsFromDirectOnly(directOnly: boolean): 0 | 1 {
  return directOnly ? 1 : 0;
}

function defaultBestWeights(): { price: number; duration: number; stops: number } {
  return { price: 0.45, duration: 0.35, stops: 0.2 };
}

function normalizedBestWeights(w: BestWeights | undefined): {
  price: number;
  duration: number;
  stops: number;
} {
  const d = defaultBestWeights();
  const price = w?.price ?? d.price;
  const duration = w?.duration ?? d.duration;
  const stops = w?.stops ?? d.stops;
  const sum = price + duration + stops;
  if (sum <= 0) return d;
  return { price: price / sum, duration: duration / sum, stops: stops / sum };
}

function collectOffers(raw: unknown): GFOffer[] {
  const r = raw as GFResponse;
  return [...(r.best_flights ?? []), ...(r.other_flights ?? [])];
}

/**
 * Outbound/return split uses IATA codes when `destinationId` is 3 letters; otherwise
 * falls back to a midpoint heuristic — non-IATA place ids can mis-split legs.
 */
function splitRoundTrip(
  flights: GFSegment[],
  destinationId: string,
): { out: GFSegment[]; ret: GFSegment[] } {
  const dest = destinationId.trim().toUpperCase();
  let split = -1;
  if (dest.length === 3) {
    for (let i = 0; i < flights.length; i++) {
      const id = flights[i]?.arrival_airport?.id?.toUpperCase();
      if (id === dest) {
        split = i;
        break;
      }
    }
  }
  if (split === -1) {
    const mid = Math.max(1, Math.floor(flights.length / 2));
    return { out: flights.slice(0, mid), ret: flights.slice(mid) };
  }
  return {
    out: flights.slice(0, split + 1),
    ret: flights.slice(split + 1),
  };
}

/**
 * Open-jaw split needs IATA-sized ids to find arrival-at-dest and departure-at-return;
 * otherwise defers to `splitRoundTrip` (midpoint) — kg/non-IATA ids risk wrong legs.
 */
function splitOpenJaw(
  flights: GFSegment[],
  destinationId: string,
  returnOriginId: string,
): { out: GFSegment[]; ret: GFSegment[] } {
  const d = destinationId.trim().toUpperCase();
  const r = returnOriginId.trim().toUpperCase();
  let endOut = -1;
  if (d.length === 3) {
    for (let i = 0; i < flights.length; i++) {
      if (flights[i]?.arrival_airport?.id?.toUpperCase() === d) {
        endOut = i;
        break;
      }
    }
  }
  let startRet = -1;
  if (r.length === 3) {
    for (let i = 0; i < flights.length; i++) {
      if (flights[i]?.departure_airport?.id?.toUpperCase() === r) {
        startRet = i;
        break;
      }
    }
  }
  if (endOut >= 0 && startRet >= 0 && startRet > endOut) {
    return {
      out: flights.slice(0, endOut + 1),
      ret: flights.slice(startRet),
    };
  }
  return splitRoundTrip(flights, destinationId);
}

function mapLeg(seg: GFSegment): FlightLeg {
  const dep = seg.departure_airport;
  const arr = seg.arrival_airport;
  return {
    departure: {
      code: dep?.id,
      name: dep?.name,
      time: dep?.time,
    },
    arrival: {
      code: arr?.id,
      name: arr?.name,
      time: arr?.time,
    },
    airline: seg.airline,
    flightNumber: seg.flight_number,
    durationMinutes: typeof seg.duration === "number" ? seg.duration : undefined,
  };
}

function stableItineraryId(input: {
  tripType: TripType;
  outboundDate: string;
  returnDate?: string;
  legs: FlightLeg[];
  totalPrice: number;
  currency: string;
  departureToken?: string;
}): string {
  const payload = JSON.stringify({
    tt: input.tripType,
    o: input.outboundDate,
    r: input.returnDate ?? "",
    legs: input.legs.map((l) => ({
      al: l.airline ?? "",
      fn: l.flightNumber ?? "",
      dc: l.departure.code ?? "",
      ac: l.arrival.code ?? "",
      dt: l.departure.time ?? "",
      at: l.arrival.time ?? "",
    })),
    p: input.totalPrice,
    c: input.currency,
    t: input.departureToken ?? "",
  });
  const h = createHash("sha256").update(payload).digest("hex").slice(0, 22);
  return `itin-${h}`;
}

function mapOfferToItinerary(e: EnrichedOffer): Itinerary {
  const offer = e.offer;
  const flights = offer.flights ?? [];
  let out: GFSegment[];
  let ret: GFSegment[];

  if (e.tripType === "one_way") {
    out = flights;
    ret = [];
  } else if (e.tripType === "open_jaw" && e.returnOriginId) {
    const sp = splitOpenJaw(flights, e.destinationId, e.returnOriginId);
    out = sp.out;
    ret = sp.ret;
  } else {
    const sp = splitRoundTrip(flights, e.destinationId);
    out = sp.out;
    ret = sp.ret;
  }

  const legs = flights.map(mapLeg);
  const stopsOutbound = Math.max(0, out.length - 1);
  const stopsReturn =
    e.tripType === "one_way" ? undefined : Math.max(0, ret.length - 1);
  const firstAir = flights[0]?.airline ?? e.providerFallback;
  const price = offer.price ?? 0;
  const totalDurationMinutes =
    typeof offer.total_duration === "number" ? offer.total_duration : 0;

  const id = stableItineraryId({
    tripType: e.tripType,
    outboundDate: e.outboundDate,
    returnDate: e.returnDate,
    legs,
    totalPrice: price,
    currency: e.currency,
    departureToken: offer.departure_token,
  });

  return {
    id,
    outboundDate: e.outboundDate,
    ...(e.returnDate !== undefined ? { returnDate: e.returnDate } : {}),
    totalPrice: price,
    currency: e.currency,
    provider: firstAir,
    bookingUrl: e.bookingUrl,
    totalDurationMinutes,
    stopsOutbound,
    ...(stopsReturn !== undefined ? { stopsReturn } : {}),
    legs,
  };
}

function dedupeItinerariesPreferLowerPrice(itins: Itinerary[]): Itinerary[] {
  const m = new Map<string, Itinerary>();
  for (const it of itins) {
    const cur = m.get(it.id);
    if (!cur || it.totalPrice < cur.totalPrice) m.set(it.id, it);
  }
  return [...m.values()];
}

function itineraryTieBreak(a: Itinerary, b: Itinerary): number {
  if (a.totalPrice !== b.totalPrice) {
    return a.totalPrice < b.totalPrice ? -1 : 1;
  }
  const da = a.totalDurationMinutes ?? 0;
  const db = b.totalDurationMinutes ?? 0;
  if (da !== db) return da < db ? -1 : 1;
  const sa =
    (a.stopsOutbound ?? 0) + (a.stopsReturn ?? 0);
  const sb =
    (b.stopsOutbound ?? 0) + (b.stopsReturn ?? 0);
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.id.localeCompare(b.id);
}

const SCORE_TIE_EPS = 1e-9;

function buildBestRankingExplanation(
  weights: { price: number; duration: number; stops: number },
  customWeights: BestWeights | undefined,
): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const base = `“Best” uses a weighted score across this result set: ${pct(weights.price)} price, ${pct(weights.duration)} total travel time, ${pct(weights.stops)} stops (each normalized vs min/max in the pool). “Cheapest” is strictly lowest price, then shorter travel time, then fewer stops.`;
  if (customWeights && Object.keys(customWeights).length > 0) {
    return `${base} Weights you sent are merged with defaults and renormalized to sum to 1.`;
  }
  return base;
}

function scoreForBest(
  it: Itinerary,
  mins: { price: number; dur: number; stops: number },
  maxs: { price: number; dur: number; stops: number },
  weights: { price: number; duration: number; stops: number },
): number {
  const p = it.totalPrice;
  const d = it.totalDurationMinutes ?? 0;
  const s = (it.stopsOutbound ?? 0) + (it.stopsReturn ?? 0);
  const norm =
    (v: number, lo: number, hi: number) =>
      hi === lo ? 1 : (v - lo) / (hi - lo);
  const pN = 1 - norm(p, mins.price, maxs.price);
  const dN = 1 - norm(d, mins.dur, maxs.dur);
  const sN = 1 - norm(s, mins.stops, maxs.stops);
  return weights.price * pN + weights.duration * dN + weights.stops * sN;
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function runRoundTripSearch(req: FlightSearchRequest & { tripType: "round_trip" }): Promise<{
  enriched: EnrichedOffer[];
  totalOffers: number;
  fetchErrors: string[];
  searchedDates: string[];
  truncated: boolean;
  repOutbound: string;
  repReturn?: string;
  tripType: TripType;
  googleFlightsUrl?: string;
}> {
  const originId = toSerpPlaceId(req.originPlaceId ?? req.origin);
  const destId = toSerpPlaceId(req.destinationPlaceId ?? req.destination);
  const adults = req.adults ?? 1;
  const stops = stopsFromDirectOnly(req.directOnly ?? false);
  const allDates = enumerateIsoDatesInclusive(
    req.outboundDateRange.start,
    req.outboundDateRange.end,
  );
  const cap = maxOutboundDates();
  let truncated = false;
  let searchedDates = allDates;
  if (allDates.length > cap) {
    searchedDates = allDates.slice(0, cap);
    truncated = true;
  }
  const returnOffset = req.tripLengthDays - 1;
  const concurrency = fetchConcurrency();
  const fetchErrors: string[] = [];

  const rawByDate = await runPool(searchedDates, concurrency, async (outboundDate) => {
    const returnDate = addCalendarDays(outboundDate, returnOffset);
    const params: GoogleFlightsParams = {
      kind: "round_trip",
      origin: originId,
      destination: destId,
      outboundDate,
      returnDate,
      adults,
      stops,
    };
    try {
      const raw = await getOrFetchGoogleFlightsJson(params);
      return { ok: true as const, outboundDate, returnDate, raw };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fetchErrors.push(`${outboundDate}: ${msg}`);
      return { ok: false as const, outboundDate, returnDate, raw: null };
    }
  });

  let totalOffers = 0;
  const enriched: EnrichedOffer[] = [];
  const providerFallback = "Google Flights";

  for (const row of rawByDate) {
    if (!row.ok || row.raw === null) continue;
    const raw = row.raw;
    const root = raw as GFResponse;
    const currency =
      root.search_parameters?.currency?.toUpperCase() ?? "USD";
    const bookingUrl = root.search_metadata?.google_flights_url;
    const offers = collectOffers(raw);
    totalOffers += offers.length;

    for (const offer of offers) {
      enriched.push({
        offer,
        tripType: "round_trip",
        outboundDate: row.outboundDate,
        returnDate: row.returnDate,
        bookingUrl,
        currency,
        destinationId: destId,
        originId,
        providerFallback,
      });
    }
  }

  const repOutbound = searchedDates[0] ?? req.outboundDateRange.start;
  const repReturn = addCalendarDays(repOutbound, returnOffset);
  const googleFlightsUrl = (rawByDate.find((r) => r.ok && r.raw)?.raw as GFResponse | undefined)
    ?.search_metadata?.google_flights_url;

  return {
    enriched,
    totalOffers,
    fetchErrors,
    searchedDates,
    truncated,
    repOutbound,
    repReturn,
    tripType: "round_trip",
    googleFlightsUrl,
  };
}

async function runOneWaySearch(req: FlightSearchRequest & { tripType: "one_way" }): Promise<{
  enriched: EnrichedOffer[];
  totalOffers: number;
  fetchErrors: string[];
  searchedDates: string[];
  truncated: boolean;
  repOutbound: string;
  tripType: TripType;
  googleFlightsUrl?: string;
}> {
  const originId = toSerpPlaceId(req.originPlaceId ?? req.origin);
  const destId = toSerpPlaceId(req.destinationPlaceId ?? req.destination);
  const adults = req.adults ?? 1;
  const stops = stopsFromDirectOnly(req.directOnly ?? false);
  const allDates = enumerateIsoDatesInclusive(
    req.outboundDateRange.start,
    req.outboundDateRange.end,
  );
  const cap = maxOutboundDates();
  let truncated = false;
  let searchedDates = allDates;
  if (allDates.length > cap) {
    searchedDates = allDates.slice(0, cap);
    truncated = true;
  }
  const concurrency = fetchConcurrency();
  const fetchErrors: string[] = [];

  const rawByDate = await runPool(searchedDates, concurrency, async (outboundDate) => {
    const params: GoogleFlightsParams = {
      kind: "one_way",
      origin: originId,
      destination: destId,
      outboundDate,
      adults,
      stops,
    };
    try {
      const raw = await getOrFetchGoogleFlightsJson(params);
      return { ok: true as const, outboundDate, raw };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fetchErrors.push(`${outboundDate}: ${msg}`);
      return { ok: false as const, outboundDate, raw: null };
    }
  });

  let totalOffers = 0;
  const enriched: EnrichedOffer[] = [];
  const providerFallback = "Google Flights";

  for (const row of rawByDate) {
    if (!row.ok || row.raw === null) continue;
    const raw = row.raw;
    const root = raw as GFResponse;
    const currency =
      root.search_parameters?.currency?.toUpperCase() ?? "USD";
    const bookingUrl = root.search_metadata?.google_flights_url;
    const offers = collectOffers(raw);
    totalOffers += offers.length;

    for (const offer of offers) {
      enriched.push({
        offer,
        tripType: "one_way",
        outboundDate: row.outboundDate,
        bookingUrl,
        currency,
        destinationId: destId,
        originId,
        providerFallback,
      });
    }
  }

  const repOutbound = searchedDates[0] ?? req.outboundDateRange.start;
  const googleFlightsUrl = (rawByDate.find((r) => r.ok && r.raw)?.raw as GFResponse | undefined)
    ?.search_metadata?.google_flights_url;

  return {
    enriched,
    totalOffers,
    fetchErrors,
    searchedDates,
    truncated,
    repOutbound,
    tripType: "one_way",
    googleFlightsUrl,
  };
}

async function runOpenJawSearch(
  req: FlightSearchRequest & { tripType: "open_jaw" },
): Promise<{
  enriched: EnrichedOffer[];
  totalOffers: number;
  fetchErrors: string[];
  searchedDates: string[];
  truncated: boolean;
  repOutbound: string;
  repReturn?: string;
  tripType: TripType;
  googleFlightsUrl?: string;
}> {
  const originId = toSerpPlaceId(req.originPlaceId ?? req.origin);
  const destId = toSerpPlaceId(req.destinationPlaceId ?? req.destination);
  const returnOriginId = toSerpPlaceId(req.returnFromPlaceId ?? req.returnFrom);
  const adults = req.adults ?? 1;
  const stops = stopsFromDirectOnly(req.directOnly ?? false);
  const allDates = enumerateIsoDatesInclusive(
    req.outboundDateRange.start,
    req.outboundDateRange.end,
  );
  const cap = maxOutboundDates();
  let truncated = false;
  let searchedDates = allDates;
  if (allDates.length > cap) {
    searchedDates = allDates.slice(0, cap);
    truncated = true;
  }
  const returnOffset = req.tripLengthDays - 1;
  const concurrency = fetchConcurrency();
  const fetchErrors: string[] = [];

  const rawByDate = await runPool(searchedDates, concurrency, async (outboundDate) => {
    const returnDate = addCalendarDays(outboundDate, returnOffset);
    // Leg 2 returns to outbound origin; API enforces R≠D; R≠O enforced in server.ts.
    const multiCityJson = JSON.stringify([
      { departure_id: originId, arrival_id: destId, date: outboundDate },
      { departure_id: returnOriginId, arrival_id: originId, date: returnDate },
    ]);
    const params: GoogleFlightsParams = {
      kind: "open_jaw",
      multiCityJson,
      adults,
      stops,
    };
    try {
      const raw = await getOrFetchGoogleFlightsJson(params);
      return { ok: true as const, outboundDate, returnDate, raw };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fetchErrors.push(`${outboundDate}: ${msg}`);
      return { ok: false as const, outboundDate, returnDate, raw: null };
    }
  });

  let totalOffers = 0;
  const enriched: EnrichedOffer[] = [];
  const providerFallback = "Google Flights";

  for (const row of rawByDate) {
    if (!row.ok || row.raw === null) continue;
    const raw = row.raw;
    const root = raw as GFResponse;
    const currency =
      root.search_parameters?.currency?.toUpperCase() ?? "USD";
    const bookingUrl = root.search_metadata?.google_flights_url;
    const offers = collectOffers(raw);
    totalOffers += offers.length;

    for (const offer of offers) {
      enriched.push({
        offer,
        tripType: "open_jaw",
        outboundDate: row.outboundDate,
        returnDate: row.returnDate,
        bookingUrl,
        currency,
        destinationId: destId,
        returnOriginId,
        originId,
        providerFallback,
      });
    }
  }

  const repOutbound = searchedDates[0] ?? req.outboundDateRange.start;
  const repReturn = addCalendarDays(repOutbound, returnOffset);
  const googleFlightsUrl = (rawByDate.find((r) => r.ok && r.raw)?.raw as GFResponse | undefined)
    ?.search_metadata?.google_flights_url;

  return {
    enriched,
    totalOffers,
    fetchErrors,
    searchedDates,
    truncated,
    repOutbound,
    repReturn,
    tripType: "open_jaw",
    googleFlightsUrl,
  };
}

export async function searchFlights(
  req: FlightSearchRequest,
): Promise<FlightSearchResponse> {
  const limit = req.limit ?? 10;
  const weights = normalizedBestWeights(req.bestWeights);

  let bundle: {
    enriched: EnrichedOffer[];
    totalOffers: number;
    fetchErrors: string[];
    searchedDates: string[];
    truncated: boolean;
    repOutbound: string;
    repReturn?: string;
    tripType: TripType;
    googleFlightsUrl?: string;
  };

  if (req.tripType === "round_trip") {
    bundle = await runRoundTripSearch(req);
  } else if (req.tripType === "one_way") {
    const o = await runOneWaySearch(req);
    bundle = { ...o, repReturn: undefined };
  } else {
    bundle = await runOpenJawSearch(req);
  }

  const { enriched, totalOffers, fetchErrors, searchedDates, truncated } = bundle;

  const allItins = enriched.map(mapOfferToItinerary);
  const pool = dedupeItinerariesPreferLowerPrice(allItins);

  const cheapestSorted = [...pool].sort((a, b) => itineraryTieBreak(a, b));
  const cheapest = cheapestSorted.slice(0, limit);

  let best: Itinerary[] = [];
  if (pool.length > 0) {
    const prices = pool.map((i) => i.totalPrice);
    const durs = pool.map((i) => i.totalDurationMinutes ?? 0);
    const stops = pool.map(
      (i) => (i.stopsOutbound ?? 0) + (i.stopsReturn ?? 0),
    );
    const mins = {
      price: Math.min(...prices),
      dur: Math.min(...durs),
      stops: Math.min(...stops),
    };
    const maxs = {
      price: Math.max(...prices),
      dur: Math.max(...durs),
      stops: Math.max(...stops),
    };
    const scored = pool
      .map((it) => ({
        it,
        s: scoreForBest(it, mins, maxs, weights),
      }))
      .sort((a, b) => {
        const diff = b.s - a.s;
        if (Math.abs(diff) > SCORE_TIE_EPS) return diff > 0 ? 1 : -1;
        return itineraryTieBreak(a.it, b.it);
      });
    best = scored.slice(0, limit).map((x) => x.it);
  }

  const noteParts: string[] = [];
  if (truncated) {
    noteParts.push(
      `Searched the first ${searchedDates.length} departure day(s) in your outbound window (server limit).`,
    );
  }
  if (fetchErrors.length > 0) {
    noteParts.push(
      `${fetchErrors.length} departure day(s) failed (timeouts or upstream errors).`,
    );
  }

  const out: FlightSearchResponse = {
    cheapest,
    best,
    totalOffers,
    meta: {
      tripType: bundle.tripType,
      outboundSearched: bundle.repOutbound,
      ...(bundle.repReturn !== undefined
        ? { returnSearched: bundle.repReturn }
        : {}),
      outboundDateRange: {
        start: searchedDates[0] ?? req.outboundDateRange.start,
        end:
          searchedDates.length > 0
            ? searchedDates[searchedDates.length - 1]!
            : req.outboundDateRange.end,
      },
      googleFlightsUrl: bundle.googleFlightsUrl,
      note: noteParts.length > 0 ? noteParts.join(" ") : undefined,
      bestRankingExplanation: buildBestRankingExplanation(
        weights,
        req.bestWeights,
      ),
    },
  };

  return FlightSearchResponseSchema.parse(out);
}

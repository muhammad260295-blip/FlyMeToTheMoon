import type { FlightSearchRequest, FlightSearchResponse } from "@fly/contracts";

const TTL_MS = 60_000;
const MAX_ENTRIES = 50;

type Entry = { expiresAt: number; data: FlightSearchResponse };

const store = new Map<string, Entry>();

function keyFor(body: FlightSearchRequest): string {
  const limit = body.limit ?? 10;
  const adults = body.adults ?? 1;
  const bw = body.bestWeights
    ? JSON.stringify(body.bestWeights)
    : "";
  const direct = body.directOnly ?? false;
  const base = [
    body.tripType,
    body.origin,
    body.destination,
    body.originPlaceId ?? "",
    body.destinationPlaceId ?? "",
    body.outboundDateRange.start,
    body.outboundDateRange.end,
    direct,
    adults,
    limit,
    bw,
  ];
  if (body.tripType === "round_trip") {
    return [...base, body.tripLengthDays].join("|");
  }
  if (body.tripType === "one_way") {
    return [...base, "ow"].join("|");
  }
  return [
    ...base,
    body.tripLengthDays,
    body.returnFrom,
    body.returnFromPlaceId ?? "",
  ].join("|");
}

function trimStore(): void {
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first === undefined) break;
    store.delete(first);
  }
}

export function getCachedSearch(
  body: FlightSearchRequest,
): FlightSearchResponse | null {
  const k = keyFor(body);
  const hit = store.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(k);
    return null;
  }
  return hit.data;
}

export function setCachedSearch(
  body: FlightSearchRequest,
  data: FlightSearchResponse,
): void {
  const k = keyFor(body);
  store.set(k, { expiresAt: Date.now() + TTL_MS, data });
  trimStore();
}

export function clearSearchCache(): void {
  store.clear();
}

/** SerpAPI Google Flights: https://serpapi.com/google-flights-api */

const SERPAPI_SEARCH = "https://serpapi.com/search";

export function isSerpApiConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY?.trim());
}

/** SerpAPI `stops`: 0 = any, 1 = nonstop only. */
export type StopsFilter = 0 | 1;

export type GoogleFlightsParams =
  | {
      kind: "round_trip";
      origin: string;
      destination: string;
      outboundDate: string;
      returnDate: string;
      adults: number;
      stops: StopsFilter;
    }
  | {
      kind: "one_way";
      origin: string;
      destination: string;
      outboundDate: string;
      adults: number;
      stops: StopsFilter;
    }
  | {
      kind: "open_jaw";
      /** JSON string for `multi_city_json` — two segments: O→D, R→O. */
      multiCityJson: string;
      adults: number;
      stops: StopsFilter;
    };

function timeoutMs(): number {
  const n = Number(process.env.SERPAPI_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 3_000 && n <= 120_000) return Math.floor(n);
  return 25_000;
}

function buildQueryParams(params: GoogleFlightsParams): URLSearchParams {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_KEY missing");
  }

  const base: Record<string, string> = {
    engine: "google_flights",
    api_key: apiKey,
    adults: String(params.adults),
    currency: "USD",
    hl: "en",
    gl: "us",
    stops: String(params.stops),
  };

  if (params.kind === "round_trip") {
    return new URLSearchParams({
      ...base,
      type: "1",
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.outboundDate,
      return_date: params.returnDate,
    });
  }

  if (params.kind === "one_way") {
    return new URLSearchParams({
      ...base,
      type: "2",
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.outboundDate,
    });
  }

  return new URLSearchParams({
    ...base,
    type: "3",
    multi_city_json: params.multiCityJson,
  });
}

/** Raw SerpAPI JSON (`engine=google_flights`). */
export async function fetchGoogleFlightsJson(
  params: GoogleFlightsParams,
  options?: { signal?: AbortSignal },
): Promise<unknown> {
  const qs = buildQueryParams(params);

  const t = timeoutMs();
  const signal = options?.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(t)])
    : AbortSignal.timeout(t);

  const res = await fetch(`${SERPAPI_SEARCH}?${qs.toString()}`, { signal });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new Error(`SerpAPI HTTP ${res.status}: ${text}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("SerpAPI returned invalid JSON");
  }

  const root = parsed as Record<string, unknown>;
  const meta = root.search_metadata as
    | { status?: string; error?: string; google_flights_url?: string }
    | undefined;

  if (meta?.status === "Error") {
    throw new Error(meta.error ?? "SerpAPI search failed");
  }

  if (root.error) {
    const err =
      typeof root.error === "string"
        ? root.error
        : JSON.stringify(root.error);
    throw new Error(err);
  }

  return parsed;
}

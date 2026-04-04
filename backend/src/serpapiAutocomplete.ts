/** SerpAPI Google Flights Autocomplete — https://serpapi.com/google-flights-autocomplete-api */

const SERPAPI_SEARCH = "https://serpapi.com/search";

export async function fetchGoogleFlightsAutocomplete(
  query: string,
): Promise<unknown> {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_KEY missing");
  }

  const qs = new URLSearchParams({
    engine: "google_flights_autocomplete",
    api_key: apiKey,
    q: query,
    hl: "en",
    gl: "us",
    exclude_regions: "true",
  });

  const res = await fetch(`${SERPAPI_SEARCH}?${qs.toString()}`);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new Error(`SerpAPI autocomplete HTTP ${res.status}: ${text}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("SerpAPI autocomplete returned invalid JSON");
  }

  const root = parsed as Record<string, unknown>;
  const meta = root.search_metadata as
    | { status?: string; error?: string }
    | undefined;

  if (meta?.status === "Error") {
    throw new Error(meta.error ?? "SerpAPI autocomplete failed");
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

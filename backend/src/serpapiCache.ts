import type { GoogleFlightsParams } from "./serpapi.js";
import { fetchGoogleFlightsJson } from "./serpapi.js";

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 400;

type Entry = { expiresAt: number; data: unknown };

const store = new Map<string, Entry>();

function ttlMs(): number {
  const n = Number(process.env.FLIGHT_SEARCH_CACHE_TTL_MS);
  if (Number.isFinite(n) && n >= 5_000 && n <= 3_600_000) return Math.floor(n);
  return DEFAULT_TTL_MS;
}

export function cacheKey(params: GoogleFlightsParams): string {
  return JSON.stringify(params);
}

function trim(): void {
  while (store.size > MAX_ENTRIES) {
    const k = store.keys().next().value;
    if (k === undefined) break;
    store.delete(k);
  }
}

/**
 * Short-lived in-memory cache for identical SerpAPI Google Flights queries.
 */
export async function getOrFetchGoogleFlightsJson(
  params: GoogleFlightsParams,
): Promise<unknown> {
  const key = cacheKey(params);
  const hit = store.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.data;
  }
  const data = await fetchGoogleFlightsJson(params);
  store.set(key, { expiresAt: Date.now() + ttlMs(), data });
  trim();
  return data;
}

export function clearSerpFlightCache(): void {
  store.clear();
}

import {
  FlightSearchResponseSchema,
  type FlightSearchRequest,
  type FlightSearchResponse,
} from "@fly/contracts";
import { apiUrl } from "./apiBase";
import { getCachedSearch, setCachedSearch } from "./searchCache";

export type SearchApiError = {
  /** HTTP status, or 0 for network / client-side failures. */
  status: number;
  message: string;
  body?: unknown;
  /** Suggested wait before retry (from Retry-After or API body). */
  retryAfterMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 8_000;

export function isSearchApiError(e: unknown): e is SearchApiError {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    typeof (e as SearchApiError).status === "number" &&
    "message" in e &&
    typeof (e as SearchApiError).message === "string"
  );
}

export function normalizeSearchError(e: unknown): SearchApiError {
  if (isSearchApiError(e)) return e;
  const message = e instanceof Error ? e.message : "Network error";
  return { status: 0, message };
}

function mergeAbortSignals(
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!userSignal) return timeoutSignal;
  return AbortSignal.any([userSignal, timeoutSignal]);
}

function parseRetryAfterMs(res: Response, parsed: unknown): number | undefined {
  const header = res.headers.get("Retry-After");
  if (header) {
    const sec = Number(header);
    if (!Number.isNaN(sec) && sec >= 0) return sec * 1000;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "retryAfterSec" in parsed
  ) {
    const n = Number((parsed as { retryAfterSec: unknown }).retryAfterSec);
    if (!Number.isNaN(n) && n >= 0) return n * 1000;
  }
  return undefined;
}

function errorMessageFromBody(parsed: unknown, fallback: string): string {
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "message" in parsed &&
    typeof (parsed as { message: unknown }).message === "string"
  ) {
    const m = (parsed as { message: string }).message.trim();
    if (m.length > 0) return m;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "error" in parsed
  ) {
    return String((parsed as { error: unknown }).error);
  }
  return fallback;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function jitter(ms: number): number {
  return Math.floor(ms * (0.85 + Math.random() * 0.3));
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  const exp = Math.min(
    MAX_BACKOFF_MS,
    BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 120),
  );
  if (retryAfterMs !== undefined && retryAfterMs > 0) {
    return jitter(Math.min(retryAfterMs, MAX_BACKOFF_MS));
  }
  return jitter(exp);
}

function shouldRetry(
  err: SearchApiError,
  attempt: number,
  maxRetries: number,
): boolean {
  if (attempt >= maxRetries) return false;
  if (err.status === 0) return true;
  if (err.status === 429) return true;
  if (err.status === 502 || err.status === 504) return true;
  return false;
}

export type PostSearchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Max retries after transient failures (429 / 5xx / network). Default 2. */
  maxRetries?: number;
  /** Skip in-memory cache read/write (e.g. forced refresh). */
  skipCache?: boolean;
};

async function postSearchOnce(
  body: FlightSearchRequest,
  options: PostSearchOptions,
): Promise<FlightSearchResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = mergeAbortSignals(options.signal, timeoutMs);

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/search"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw normalizeSearchError(e);
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const retryAfterMs = parseRetryAfterMs(res, parsed);
    const err: SearchApiError = {
      status: res.status,
      message: errorMessageFromBody(parsed, res.statusText),
      body: parsed,
      retryAfterMs,
    };
    throw err;
  }

  const decoded = FlightSearchResponseSchema.safeParse(parsed);
  if (!decoded.success) {
    const err: SearchApiError = {
      status: 502,
      message: "Invalid response from server",
      body: decoded.error.flatten(),
    };
    throw err;
  }

  return decoded.data;
}

export async function postSearch(
  body: FlightSearchRequest,
  options?: PostSearchOptions,
): Promise<FlightSearchResponse> {
  const skipCache = options?.skipCache ?? false;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  if (!skipCache) {
    const cached = getCachedSearch(body);
    if (cached) return cached;
  }

  let lastError: SearchApiError | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      const data = await postSearchOnce(body, options ?? {});
      if (!skipCache) setCachedSearch(body, data);
      return data;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      const err = normalizeSearchError(e) as SearchApiError;
      lastError = err;
      if (!shouldRetry(err, attempt, maxRetries)) throw err;
      const wait = backoffMs(attempt, err.retryAfterMs);
      try {
        await sleep(wait, options?.signal);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        throw e;
      }
    }
  }
  throw lastError ?? normalizeSearchError(new Error("Search failed"));
}

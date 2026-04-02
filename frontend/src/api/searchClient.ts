import type { SearchRequest, SearchResponse } from "@fly/contracts";

export type SearchApiError = {
  status: number;
  message: string;
  body?: unknown;
};

export async function postSearch(
  body: SearchRequest,
): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const err: SearchApiError = {
      status: res.status,
      message:
        typeof parsed === "object" && parsed !== null && "error" in parsed
          ? String((parsed as { error?: unknown }).error)
          : res.statusText,
      body: parsed,
    };
    throw err;
  }

  return parsed as SearchResponse;
}

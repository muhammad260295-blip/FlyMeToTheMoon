import {
  PlaceSuggestResponseSchema,
  type PlaceSuggestResponse,
} from "@fly/contracts";
import { apiUrl } from "./apiBase";

export async function postPlaceSuggest(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestResponse> {
  const res = await fetch(apiUrl("/api/places/suggest"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new Error(
      typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : `Suggest failed (${res.status})`,
    );
  }

  const decoded = PlaceSuggestResponseSchema.safeParse(parsed);
  if (!decoded.success) {
    throw new Error("Invalid suggest response");
  }
  return decoded.data;
}

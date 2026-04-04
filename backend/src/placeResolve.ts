import type { PlaceCandidate } from "@fly/contracts";
import { PlaceCandidateSchema, PlaceSuggestResponseSchema } from "@fly/contracts";
import { fetchGoogleFlightsAutocomplete } from "./serpapiAutocomplete.js";

type RawAirport = {
  id?: string;
  name?: string;
  city?: string;
  distance?: string;
};

type RawSuggestion = {
  name?: string;
  type?: string;
  description?: string;
  id?: string;
  airports?: RawAirport[];
};

export function flattenSerpAutocomplete(raw: unknown): PlaceCandidate[] {
  const root = raw as { suggestions?: RawSuggestion[] };
  const list = root.suggestions ?? [];
  const out: PlaceCandidate[] = [];

  for (const s of list) {
    if (!s.id) continue;
    if (s.airports && s.airports.length > 0) {
      for (const a of s.airports) {
        if (!a.id) continue;
        const label = a.name ? `${a.name} (${a.id})` : a.id;
        const c: PlaceCandidate = {
          placeId: a.id,
          label,
          subtitle: s.name,
          kind: "airport",
        };
        out.push(PlaceCandidateSchema.parse(c));
      }
    } else {
      const kind =
        s.type === "region" ? "region" : ("city" as const);
      const c: PlaceCandidate = {
        placeId: s.id,
        label: s.name ?? s.id,
        subtitle: s.description,
        kind,
      };
      out.push(PlaceCandidateSchema.parse(c));
    }
  }

  return out;
}

export type ResolvePlaceResult =
  | { kind: "ok"; id: string }
  | { kind: "ambiguous"; candidates: PlaceCandidate[] }
  | { kind: "empty" };

/**
 * Resolve a user-typed place to a SerpAPI `departure_id` / `arrival_id`.
 * - Uses explicit `placeId` from autocomplete when provided.
 * - 3-letter input is treated as IATA without calling autocomplete.
 * - Otherwise calls Google Flights Autocomplete and applies disambiguation rules.
 */
export async function resolvePlaceSide(
  label: string,
  explicitPlaceId: string | undefined,
): Promise<ResolvePlaceResult> {
  const explicit = explicitPlaceId?.trim();
  if (explicit) {
    return { kind: "ok", id: explicit };
  }

  const t = label.trim();
  if (t.length === 3 && /^[A-Za-z]{3}$/.test(t)) {
    return { kind: "ok", id: t.toUpperCase() };
  }

  if (t.length < 2) {
    return { kind: "empty" };
  }

  const raw = await fetchGoogleFlightsAutocomplete(t);
  const flat = flattenSerpAutocomplete(raw);
  if (flat.length === 0) {
    return { kind: "empty" };
  }
  if (flat.length === 1) {
    return { kind: "ok", id: flat[0].placeId };
  }
  return { kind: "ambiguous", candidates: flat };
}

export async function buildSuggestResponse(
  query: string,
): Promise<{ suggestions: PlaceCandidate[] }> {
  const t = query.trim();
  if (t.length < 1) {
    return PlaceSuggestResponseSchema.parse({ suggestions: [] });
  }
  const raw = await fetchGoogleFlightsAutocomplete(t);
  const flat = flattenSerpAutocomplete(raw);
  return PlaceSuggestResponseSchema.parse({ suggestions: flat });
}

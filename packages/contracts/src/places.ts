import { z } from "zod";

/** Flattened row for UI + SerpAPI `departure_id` / `arrival_id`. */
export const PlaceCandidateSchema = z.object({
  placeId: z.string(),
  label: z.string(),
  subtitle: z.string().optional(),
  kind: z.enum(["airport", "city", "region"]),
});

export type PlaceCandidate = z.infer<typeof PlaceCandidateSchema>;

export const PlaceSuggestRequestSchema = z.object({
  query: z.string().min(1).max(120).transform((s) => s.trim()),
});

export type PlaceSuggestRequest = z.infer<typeof PlaceSuggestRequestSchema>;

export const PlaceSuggestResponseSchema = z.object({
  suggestions: z.array(PlaceCandidateSchema),
});

export type PlaceSuggestResponse = z.infer<typeof PlaceSuggestResponseSchema>;

import { z } from "zod";

/** Single search hit returned to clients. */
export const SearchHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
});

export type SearchHit = z.infer<typeof SearchHitSchema>;

/** POST /api/search — request body. */
export const SearchRequestSchema = z.object({
  query: z.string().min(1, "query is required").max(200),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/** POST /api/search — JSON response body. */
export const SearchResponseSchema = z.object({
  results: z.array(SearchHitSchema),
  total: z.number().int().min(0),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

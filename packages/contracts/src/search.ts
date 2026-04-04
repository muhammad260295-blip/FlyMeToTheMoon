import { z } from "zod";

/**
 * True when `s` is YYYY-MM-DD and matches the UTC calendar (rejects e.g. 2025-02-31).
 * Use in clients when validating URL/query params before calling the API.
 */
export function isValidIsoDateString(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isValidIsoDateString, {
    message: "outboundDateRange must use real calendar dates (YYYY-MM-DD)",
  });

/** Inclusive calendar range for outbound travel (flex search window). */
export const DateRangeSchema = z
  .object({
    start: isoDate,
    end: isoDate,
  })
  .refine((d) => d.start <= d.end, {
    message: "outboundDateRange.start must be on or before end",
  });

export type DateRange = z.infer<typeof DateRangeSchema>;

export const TripTypeSchema = z.enum(["round_trip", "one_way", "open_jaw"]);
export type TripType = z.infer<typeof TripTypeSchema>;

/**
 * Optional weights for the server’s **composite “Best” score** (normalized price,
 * duration, stops — see API docs). Not raw SerpAPI `best_flights`; the `best`
 * response array is computed in `searchProvider` after pooling offers.
 */
export const BestWeightsSchema = z.object({
  price: z.number().min(0).max(1).optional(),
  duration: z.number().min(0).max(1).optional(),
  stops: z.number().min(0).max(1).optional(),
});

export type BestWeights = z.infer<typeof BestWeightsSchema>;

const placeFields = z.object({
  /** Display / typed label (shown in UI). */
  origin: z.string().min(2).max(120).transform((s) => s.trim()),
  destination: z.string().min(2).max(120).transform((s) => s.trim()),
  /**
   * Resolved SerpAPI place id (IATA or kgmid `/m/...`) from autocomplete.
   * When set, skips server-side disambiguation for that endpoint.
   */
  originPlaceId: z.string().min(1).max(120).optional(),
  destinationPlaceId: z.string().min(1).max(120).optional(),
});

const searchOptions = z.object({
  outboundDateRange: DateRangeSchema,
  /**
   * Maps to SerpAPI `stops`: `1` = nonstop-only requests; `false` = any (default).
   * Not a hard guarantee on parsed segments if upstream misbehaves.
   */
  directOnly: z.boolean().optional().default(false),
  adults: z.number().int().min(1).max(9).optional().default(1),
  limit: z.number().int().min(1).max(50).optional().default(10),
  bestWeights: BestWeightsSchema.optional(),
});

/** POST /api/search — discriminated by `tripType` (validation rules per variant). */
export const FlightSearchRequestSchema = z.discriminatedUnion("tripType", [
  placeFields.merge(searchOptions).extend({
    tripType: z.literal("round_trip"),
    /**
     * Inclusive calendar days from outbound departure through return arrival.
     * Return date = outbound + (tripLengthDays − 1).
     */
    tripLengthDays: z.number().int().min(1).max(365),
  }),
  placeFields.merge(searchOptions).extend({
    tripType: z.literal("one_way"),
  }),
  placeFields.merge(searchOptions).extend({
    tripType: z.literal("open_jaw"),
    tripLengthDays: z.number().int().min(1).max(365),
    /**
     * Open jaw: outbound O→D, return R→O (home). Required; must differ from
     * destination after place resolution (R ≠ D).
     */
    returnFrom: z.string().min(2).max(120).transform((s) => s.trim()),
    returnFromPlaceId: z.string().min(1).max(120).optional(),
  }),
]);

export type FlightSearchRequest = z.infer<typeof FlightSearchRequestSchema>;

export const AirportSnapshotSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  time: z.string().optional(),
});

export const FlightLegSchema = z.object({
  departure: AirportSnapshotSchema,
  arrival: AirportSnapshotSchema,
  airline: z.string().optional(),
  flightNumber: z.string().optional(),
  durationMinutes: z.number().int().min(0).optional(),
});

export type FlightLeg = z.infer<typeof FlightLegSchema>;

/** One priced option with legs and booking context. */
export const ItinerarySchema = z.object({
  id: z.string(),
  outboundDate: isoDate,
  /** Omitted for one-way itineraries. */
  returnDate: isoDate.optional(),
  totalPrice: z.number(),
  currency: z.string(),
  provider: z.string(),
  bookingUrl: z.string().optional(),
  totalDurationMinutes: z.number().int().min(0).optional(),
  stopsOutbound: z.number().int().min(0).optional(),
  /** Omitted for one-way (no return segment). */
  stopsReturn: z.number().int().min(0).optional(),
  legs: z.array(FlightLegSchema),
});

export type Itinerary = z.infer<typeof ItinerarySchema>;

export const FlightSearchResponseSchema = z.object({
  cheapest: z.array(ItinerarySchema),
  best: z.array(ItinerarySchema),
  totalOffers: z.number().int().min(0),
  meta: z
    .object({
      tripType: TripTypeSchema,
      outboundSearched: isoDate,
      /** Absent for one-way. */
      returnSearched: isoDate.optional(),
      outboundDateRange: DateRangeSchema.optional(),
      googleFlightsUrl: z.string().optional(),
      note: z.string().optional(),
      bestRankingExplanation: z.string().optional(),
    })
    .optional(),
});

export type FlightSearchResponse = z.infer<typeof FlightSearchResponseSchema>;

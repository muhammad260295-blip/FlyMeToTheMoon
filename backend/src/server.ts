import "dotenv/config";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  FlightSearchRequestSchema,
  FlightSearchResponseSchema,
  PlaceSuggestRequestSchema,
  PlaceSuggestResponseSchema,
} from "@fly/contracts";
import Fastify from "fastify";
import { buildSuggestResponse, resolvePlaceSide } from "./placeResolve.js";
import { isSerpApiConfigured } from "./serpapi.js";
import { searchFlights } from "./searchProvider.js";

const PORT = Number(process.env.PORT) || 3001;

const app = Fastify({ logger: true });

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

await app.register(
  cors,
  allowedOrigins && allowedOrigins.length > 0
    ? { origin: allowedOrigins }
    : { origin: true },
);

app.get("/health", async () => ({ ok: true }));

function samePlaceId(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

await app.register(
  async function searchApi(fastify) {
    await fastify.register(rateLimit, {
      max: 120,
      timeWindow: "1 minute",
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: (_req, ctx) => ({
        error: "rate_limited",
        message: "Too many requests. Please wait a moment and try again.",
        retryAfterSec: Math.ceil(ctx.ttl / 1000),
      }),
    });

    fastify.post("/api/places/suggest", async (request, reply) => {
      const parsed = PlaceSuggestRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_request",
          message: "Provide a non-empty query string.",
          details: parsed.error.flatten(),
        });
      }

      if (!isSerpApiConfigured()) {
        return reply.status(503).send({
          error: "not_configured",
          message:
            "Place search is not configured. Set SERPAPI_KEY in backend/.env.",
        });
      }

      try {
        const out = await buildSuggestResponse(parsed.data.query);
        return PlaceSuggestResponseSchema.parse(out);
      } catch (err) {
        fastify.log.error(err);
        const msg =
          err instanceof Error ? err.message : "Place suggest failed";
        return reply.status(502).send({
          error: "upstream_error",
          message: msg,
        });
      }
    });

    fastify.post("/api/search", async (request, reply) => {
      const parsed = FlightSearchRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "invalid_request",
          message:
            "Check trip type, places, dates, trip length (when required), and direct-only flag.",
          details: parsed.error.flatten(),
        });
      }

      if (!isSerpApiConfigured()) {
        return reply.status(503).send({
          error: "not_configured",
          message:
            "Flight search is not configured. Set SERPAPI_KEY in backend/.env (see serpapi.com).",
        });
      }

      const body = parsed.data;

      try {
        const origin = await resolvePlaceSide(
          body.origin,
          body.originPlaceId,
        );
        if (origin.kind === "empty") {
          return reply.status(400).send({
            error: "place_not_found",
            field: "origin",
            message: "No matching airports or cities for the origin you entered.",
          });
        }
        if (origin.kind === "ambiguous") {
          return reply.status(422).send({
            error: "place_ambiguous",
            field: "origin",
            message:
              "Multiple places match. Pick one from the list or choose from suggestions while typing.",
            candidates: origin.candidates,
          });
        }

        const dest = await resolvePlaceSide(
          body.destination,
          body.destinationPlaceId,
        );
        if (dest.kind === "empty") {
          return reply.status(400).send({
            error: "place_not_found",
            field: "destination",
            message:
              "No matching airports or cities for the destination you entered.",
          });
        }
        if (dest.kind === "ambiguous") {
          return reply.status(422).send({
            error: "place_ambiguous",
            field: "destination",
            message:
              "Multiple places match. Pick one from the list or choose from suggestions while typing.",
            candidates: dest.candidates,
          });
        }

        if (samePlaceId(origin.id, dest.id)) {
          return reply.status(400).send({
            error: "invalid_route",
            field: "destination",
            message: "Origin and destination must be different.",
          });
        }

        let returnFromResolved: { id: string } | null = null;
        if (body.tripType === "open_jaw") {
          const rf = await resolvePlaceSide(
            body.returnFrom,
            body.returnFromPlaceId,
          );
          if (rf.kind === "empty") {
            return reply.status(400).send({
              error: "place_not_found",
              field: "returnFrom",
              message:
                "No matching airports or cities for the return-from place you entered.",
            });
          }
          if (rf.kind === "ambiguous") {
            return reply.status(422).send({
              error: "place_ambiguous",
              field: "returnFrom",
              message:
                "Multiple places match for return-from. Pick one from the list or choose from suggestions while typing.",
              candidates: rf.candidates,
            });
          }
          if (samePlaceId(rf.id, dest.id)) {
            return reply.status(400).send({
              error: "invalid_open_jaw",
              field: "returnFrom",
              message:
                "Open jaw requires a different city for “return from” than your outbound destination.",
            });
          }
          if (samePlaceId(rf.id, origin.id)) {
            return reply.status(400).send({
              error: "invalid_open_jaw",
              field: "returnFrom",
              message:
                "“Return from” must differ from your outbound origin (open jaw).",
            });
          }
          returnFromResolved = { id: rf.id };
        }

        const merged = {
          ...body,
          originPlaceId: origin.id,
          destinationPlaceId: dest.id,
          ...(body.tripType === "open_jaw" && returnFromResolved
            ? { returnFromPlaceId: returnFromResolved.id }
            : {}),
        };

        const response = await searchFlights(merged);
        const out = FlightSearchResponseSchema.parse(response);
        return out;
      } catch (err) {
        fastify.log.error(err);
        const msg =
          err instanceof Error ? err.message : "Flight search failed";
        return reply.status(502).send({
          error: "upstream_error",
          message: msg,
        });
      }
    });
  },
  { prefix: "" },
);

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

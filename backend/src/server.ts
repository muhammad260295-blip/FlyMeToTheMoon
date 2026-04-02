import cors from "@fastify/cors";
import {
  SearchRequestSchema,
  SearchResponseSchema,
} from "@fly/contracts";
import Fastify from "fastify";
import { searchStub } from "./searchProvider.js";

const PORT = Number(process.env.PORT) || 3001;

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));

app.post("/api/search", async (request, reply) => {
  const parsed = SearchRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_request",
      details: parsed.error.flatten(),
    });
  }

  const body = parsed.data;
  const response = await searchStub(body);
  const out = SearchResponseSchema.parse(response);
  return out;
});

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

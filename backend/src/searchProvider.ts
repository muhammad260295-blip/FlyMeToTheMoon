import type { SearchHit, SearchRequest, SearchResponse } from "@fly/contracts";

const stubCatalog: SearchHit[] = [
  {
    id: "m1",
    title: "Fly Me to the Moon",
    description: "Frank Sinatra — classic standard.",
  },
  {
    id: "m2",
    title: "Moon River",
    description: "Breakfast at Tiffany's soundtrack.",
  },
  {
    id: "m3",
    title: "Rocket Man",
    description: "Elton John — space-themed pop.",
  },
  {
    id: "m4",
    title: "Space Oddity",
    description: "David Bowie — Major Tom.",
  },
];

function score(hit: SearchHit, q: string): number {
  const hay = `${hit.title} ${hit.description ?? ""}`.toLowerCase();
  const needle = q.toLowerCase();
  if (!needle) return 0;
  if (hay.includes(needle)) return 2;
  return needle.split(/\s+/).some((w) => w.length > 1 && hay.includes(w)) ? 1 : 0;
}

/** Stub provider: filters an in-memory catalog by query relevance. */
export async function searchStub(req: SearchRequest): Promise<SearchResponse> {
  const q = req.query.trim();
  const limit = req.limit ?? 10;
  const ranked = stubCatalog
    .map((hit) => ({ hit, s: score(hit, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.hit.title.localeCompare(b.hit.title));
  const total = ranked.length;
  const results = ranked.slice(0, limit).map((x) => x.hit);
  return { results, total };
}

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { postSearch, type SearchApiError } from "../api/searchClient";
import type { SearchResponse } from "@fly/contracts";

type ViewState =
  | { kind: "idle" }
  | { kind: "loading"; query: string }
  | { kind: "ready"; query: string; data: SearchResponse }
  | { kind: "error"; query: string; error: SearchApiError };

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const qParam = params.get("q") ?? "";

  const [input, setInput] = useState(qParam);
  const [state, setState] = useState<ViewState>({ kind: "idle" });

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setState({ kind: "idle" });
      return;
    }

    setState({ kind: "loading", query: trimmed });
    try {
      const data = await postSearch({ query: trimmed, limit: 20 });
      setState({ kind: "ready", query: trimmed, data });
    } catch (e) {
      const err = e as SearchApiError;
      setState({ kind: "error", query: trimmed, error: err });
    }
  }, []);

  useEffect(() => {
    setInput(qParam);
    if (!qParam.trim()) {
      setState({ kind: "idle" });
      return;
    }
    void runSearch(qParam);
  }, [qParam, runSearch]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = input.trim();
    if (!next) {
      setParams({});
      setState({ kind: "idle" });
      return;
    }
    setParams({ q: next });
  };

  const banner = useMemo(() => {
    if (state.kind === "idle") {
      return (
        <p className="banner muted">
          Enter a term (try <strong>moon</strong> or <strong>space</strong>) and
          submit to search the stub catalog.
        </p>
      );
    }
    if (state.kind === "loading") {
      return (
        <p className="banner loading" role="status" aria-live="polite">
          Searching for “{state.query}”…
        </p>
      );
    }
    if (state.kind === "error") {
      return (
        <p className="banner error" role="alert">
          Search failed ({state.error.status}): {state.error.message}
        </p>
      );
    }
    return null;
  }, [state]);

  const empty =
    state.kind === "ready" && state.data.total === 0 ? (
      <div className="empty-state">
        <h2>No matches</h2>
        <p>
          Nothing in the stub catalog matched “{state.query}”. Try another
          keyword.
        </p>
      </div>
    ) : null;

  const results =
    state.kind === "ready" && state.data.total > 0 ? (
      <ul className="results">
        {state.data.results.map((hit) => (
          <li key={hit.id} className="result-card">
            <h2>{hit.title}</h2>
            {hit.description ? <p>{hit.description}</p> : null}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <section className="page search-page">
      <h1>Search</h1>
      <form className="search-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="q">
          Search query
        </label>
        <input
          id="q"
          name="q"
          type="search"
          autoComplete="off"
          placeholder="Search the catalog…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>
      {banner}
      {empty}
      {results}
    </section>
  );
}

/**
 * Production: set `VITE_API_BASE_URL` to your deployed API origin (no trailing slash),
 * e.g. `https://fly-api.railway.app`. Dev: leave unset so `/api/*` uses the Vite proxy.
 * Never put secrets here — only public URLs. `SERPAPI_KEY` stays on the server only.
 */
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  if (!path.startsWith("/")) {
    return base ? `${base}/${path}` : `/${path}`;
  }
  return base ? `${base}${path}` : path;
}

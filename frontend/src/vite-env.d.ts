/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public API origin for production (no trailing slash). Omit in dev to use Vite `/api` proxy. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

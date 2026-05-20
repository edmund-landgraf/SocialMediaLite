/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin only (e.g. `https://api.unwhelm.online`). Empty = same-origin `/api/...`. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

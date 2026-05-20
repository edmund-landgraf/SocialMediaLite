export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  static maybe(err: unknown): ApiError | null {
    return err instanceof ApiError ? err : null;
  }
}

/**
 * API origin from `VITE_API_URL` (repo-root `.env`).
 * Use origin only — paths already include `/api/...` (never set `.../api` as the base).
 * Empty string = same-origin relative URLs (local Vite proxy + production nginx).
 */
export function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_URL?.trim() ?? "";
  return raw.replace(/\/+$/, "");
}

/** Resolve a path like `/api/me` against optional `VITE_API_URL`. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = getApiOrigin();
  return origin ? `${origin}${normalized}` : normalized;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
  });
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  if (init?.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await apiFetch(path, {
    ...init,
    headers,
  });

  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }

  return body as T;
}

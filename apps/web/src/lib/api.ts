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

type ZodFlattenLike = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

function messageFromApiErrorPayload(error: unknown): string | null {
  if (typeof error === "string") return error.trim() || null;
  if (!error || typeof error !== "object") return null;

  if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
    const msg = (error as { message: string }).message.trim();
    if (msg) return msg;
  }

  const flat = error as ZodFlattenLike;
  const parts: string[] = [];
  for (const msg of flat.formErrors ?? []) {
    if (msg.trim()) parts.push(msg.trim());
  }
  for (const [field, msgs] of Object.entries(flat.fieldErrors ?? {})) {
    const joined = (msgs ?? []).filter(Boolean).join(", ");
    if (joined) parts.push(`${field}: ${joined}`);
  }
  if (parts.length > 0) return parts.join(" · ");

  return null;
}

/** Human-readable message from an API error body or thrown ApiError. */
export function formatApiError(err: unknown, fallback = "Request failed"): string {
  const apiErr = ApiError.maybe(err);
  if (apiErr) {
    if (apiErr.body && typeof apiErr.body === "object" && apiErr.body && "error" in apiErr.body) {
      const fromPayload = messageFromApiErrorPayload((apiErr.body as { error: unknown }).error);
      if (fromPayload) return fromPayload;
    }
    if (apiErr.message && !apiErr.message.includes("[object Object]")) return apiErr.message;
  }
  if (err instanceof Error && err.message && !err.message.includes("[object Object]")) {
    return err.message;
  }
  return fallback;
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
    const fromBody =
      typeof body === "object" && body && "error" in body
        ? messageFromApiErrorPayload((body as { error: unknown }).error)
        : null;
    const msg = fromBody ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }

  return body as T;
}

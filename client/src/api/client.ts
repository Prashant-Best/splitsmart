/** An error response from the API, with its stable code and any field-level details. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
}

/**
 * Calls the API on the same origin (Vite proxies /api in development, nginx in Docker), so the
 * httpOnly session cookie is sent automatically and never touched by JavaScript.
 */
export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers:
      options.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body:
      options.body === undefined
        ? undefined
        : isForm
          ? (options.body as FormData)
          : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** A message to show for any error. */
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

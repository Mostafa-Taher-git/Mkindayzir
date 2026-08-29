const BASE_URL = import.meta.env.VITE_API_URL ?? "";

let getClerkToken: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(getToken: () => Promise<string | null>) {
  getClerkToken = getToken;
  // Install global fetch interceptor once — ensures every raw fetch("/api/...") also
  // carries the Clerk Bearer token. Without this, 50+ legacy fetch() calls 401
  // and the dashboard redirects back to /login (the "already signed in" loop).
  if (typeof window !== "undefined" && !(window as unknown as Record<string, unknown>).__mk_fetch_patched) {
    const origFetch = window.fetch.bind(window);
    (window as unknown as Record<string, unknown>).__mk_fetch_patched = true;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const isApi = url.includes("/api/");
      if (isApi && getClerkToken) {
        try {
          const token = await getClerkToken();
          if (token) {
            const headers = new Headers(init?.headers || (typeof input !== "string" && !(input instanceof URL) ? (input as Request).headers : undefined));
            if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
            return origFetch(input, { ...init, headers, credentials: init?.credentials ?? "include" });
          }
        } catch {
          // fall through to unauthenticated fetch
        }
      }
      return origFetch(input, init as RequestInit);
    };
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (getClerkToken) {
    const token = await getClerkToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      if (v !== undefined) headers[k] = String(v);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    throw new Error(error?.message ?? error?.error?.message ?? "Request failed");
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: "GET" }),
  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "POST",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  patch: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "PATCH",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  put: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "PUT",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),
};

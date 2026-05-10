/**
 * In dev, Vite proxies /api to FastAPI. Set VITE_API_BASE to full URL if not using the proxy.
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base}${path}`;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const controller = new AbortController();
  const t = timeoutMs ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(apiUrl(path), {
      ...rest,
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(rest.headers as Record<string, string>),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  } finally {
    if (t) window.clearTimeout(t);
  }
}

export async function apiDelete(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<void> {
  const { timeoutMs, ...rest } = init ?? {};
  const controller = new AbortController();
  const t = timeoutMs ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(apiUrl(path), {
      ...rest,
      method: "DELETE",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(rest.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    }
  } finally {
    if (t) window.clearTimeout(t);
  }
}

export async function apiGet<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const controller = new AbortController();
  const t = timeoutMs
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : undefined;
  try {
    const res = await fetch(apiUrl(path), {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(rest.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  } finally {
    if (t) window.clearTimeout(t);
  }
}

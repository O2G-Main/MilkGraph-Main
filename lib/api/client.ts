export type ApiError = Error & { code: string; field?: string; status: number };
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://api.milkgraph.web.id").replace(/\/$/, "");
export const API_MODE = process.env.NEXT_PUBLIC_DATA_MODE === "api";

async function request<T>(method: string, path: string, role: string, body?: unknown, base = API_URL): Promise<T> {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { "X-Demo-Role": role, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = value?.error;
    const error = new Error(detail?.message || `HTTP ${response.status}`) as ApiError;
    error.code = detail?.code || "HTTP_ERROR";
    error.field = detail?.field;
    error.status = response.status;
    throw error;
  }
  return value as T;
}
export const apiGet = <T>(path: string, role: string, base?: string) => request<T>("GET", path, role, undefined, base);
export const apiSend = <T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body: unknown, role: string, base?: string) => request<T>(method, path, role, body, base);

/** Unggah multipart (import CSV). Content-Type tidak diset manual supaya browser mengisi boundary multipart. */
export async function apiUpload<T>(path: string, form: FormData, role: string, base = API_URL): Promise<T> {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: "POST",
    headers: { "X-Demo-Role": role },
    body: form,
    cache: "no-store",
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = value?.error;
    const error = new Error(detail?.message || `HTTP ${response.status}`) as ApiError;
    error.code = detail?.code || "HTTP_ERROR";
    error.field = detail?.field;
    error.status = response.status;
    throw error;
  }
  return value as T;
}

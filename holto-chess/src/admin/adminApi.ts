import type { FeedbackCategory, FeedbackItem, FeedbackStatus } from "../shared/feedback";

export type Mailbox = "inbox" | "archived";
export interface CountRow { category: FeedbackCategory; status: FeedbackStatus; total: number }
export interface FeedbackPage { items: FeedbackItem[]; nextBefore: number | null; counts: CountRow[] }

/** Thrown when the session is missing or expired, so the app can return to the login form. */
export class UnauthorizedError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store",
  });
  if (response.status === 401 && path !== "/login") throw new UnauthorizedError();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error((body as { error?: string }).error ?? String(response.status)), { status: response.status });
  return body as T;
}

export const adminApi = {
  session: () => call<{ username: string }>("/session"),
  login: (username: string, password: string) => call<{ username: string }>("/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => call<{ ok: true }>("/logout", { method: "POST" }),
  list: (box: Mailbox, category: FeedbackCategory | "all", before?: number) => {
    const query = new URLSearchParams({ box });
    if (category !== "all") query.set("category", category);
    if (before) query.set("before", String(before));
    return call<FeedbackPage>(`/feedback?${query}`);
  },
  setStatus: (id: number, status: FeedbackStatus) => call<{ ok: true }>(`/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  remove: (id: number) => call<{ ok: true }>(`/feedback/${id}`, { method: "DELETE" }),
};

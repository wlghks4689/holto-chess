import { validateFeedback } from "../src/shared/feedback";

const MAX_BODY_BYTES = 4096;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** POST /api/feedback from the start screen. Stores the message for the admin inbox; the sender's IP is never kept. */
export async function submitFeedback(request: Request, env: Env): Promise<Response> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "content-type" }, 415);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json({ error: "too-large" }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: "json" }, 400); }
  // A filled honeypot is a bot. Answer as if it worked so it has nothing to learn from.
  if (body && typeof body === "object" && typeof (body as { website?: unknown }).website === "string" && (body as { website: string }).website) {
    return json({ ok: true }, 201);
  }
  const result = validateFeedback(body);
  if (!result.ok) return json({ error: result.error }, 400);
  const { category, message, contactEmail, locale } = result.value;
  const now = Date.now();
  await env.FEEDBACK_DB.prepare(
    "INSERT INTO feedback (category, message, contact_email, locale, user_agent, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'unread', ?, ?)",
  ).bind(category, message, contactEmail, locale, request.headers.get("User-Agent")?.slice(0, 300) ?? null, now, now).run();
  return json({ ok: true }, 201);
}

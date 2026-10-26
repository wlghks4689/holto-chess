/**
 * Login, profiles and the season ranking are closed for now (decision HOME-GATE-001). While closed the Worker ignores
 * account session cookies for new seats, so a visitor who signed in before plays as a guest instead of being refused,
 * and the account and ranking APIs answer as if nobody is signed in. Accounts, sessions and rank data stay in the
 * database untouched. ACCOUNTS_ENABLED="1" reopens them, together with ACCOUNTS_ENABLED in src/shared/features.ts.
 */
export function accountsEnabled(env: Env): boolean {
  // The generated Env types the deployed value ("0") as a literal; the switch is meant to change, so read it as data.
  return String((env as unknown as { ACCOUNTS_ENABLED?: unknown }).ACCOUNTS_ENABLED) === "1";
}

/** What a closed account API answers. A tab opened before the closure still gets a well-formed "not signed in". */
export function closedAccountResponse(request: Request, url: URL): Response {
  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    return Response.json({ authenticated: false }, { headers: { "Cache-Control": "no-store", "Vary": "Cookie" } });
  }
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

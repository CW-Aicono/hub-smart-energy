// Guard for internal/cron-only edge functions.
// pg_cron calls them via private.invoke_edge_function with the service-role key
// as Bearer token. Anything else (anonymous internet requests, normal user JWTs)
// is rejected.

function candidateKeys(): string[] {
  const keys: string[] = [];
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) keys.push(legacy);
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      for (const v of Object.values(parsed ?? {})) if (typeof v === "string") keys.push(v);
    } catch { /* ignore */ }
  }
  const cron = Deno.env.get("CRON_SECRET");
  if (cron) keys.push(cron);
  return keys;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function isInternalCaller(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const keys = candidateKeys();
  return keys.some((k) => (token && safeEqual(token, k)) || (cronHeader && safeEqual(cronHeader, k)));
}

/** Returns a 401 Response when the caller is not internal, otherwise null. */
export function rejectIfNotInternal(req: Request, headers: Record<string, string> = {}): Response | null {
  if (req.method === "OPTIONS") return null;
  if (isInternalCaller(req)) return null;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

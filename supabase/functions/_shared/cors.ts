/**
 * Shared CORS helper – BSI TR-03181 K3
 * Restricts Access-Control-Allow-Origin to known origins.
 */

const ALLOWED_ORIGINS = [
  "https://hub-smart-energy.lovable.app",
  "https://id-preview--1e1d0ab0-a25d-49ac-9d3a-662f96a9ba12.lovable.app",
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get("Origin") || "";
  const isAllowed = ALLOWED_ORIGINS.some(
    (o) => origin === o || origin.endsWith(".lovable.app"),
  );
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

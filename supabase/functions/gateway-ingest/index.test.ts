import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const ENDPOINT = `${SUPABASE_URL}/functions/v1/gateway-ingest`;

Deno.test("gateway-ingest returns 401 without API key", async () => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ readings: [] }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.error, "Unauthorized");
});

Deno.test("gateway-ingest returns 401 with wrong API key", async () => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ readings: [] }),
    headers: {
      Authorization: "Bearer wrong-key",
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.error, "Unauthorized");
});

Deno.test("gateway-ingest OPTIONS returns CORS headers", async () => {
  const res = await fetch(ENDPOINT, {
    method: "OPTIONS",
  });
  await res.text();
  assertEquals(res.status, 200);
  assertExists(res.headers.get("access-control-allow-origin"));
});

// -- Schneider Basic Auth tests --

Deno.test("schneider-push returns 401 with invalid Basic Auth credentials", async () => {
  const creds = btoa("wronguser:wrongpass");
  const res = await fetch(`${ENDPOINT}?action=schneider-push&tenant_id=00000000-0000-0000-0000-000000000000`, {
    method: "POST",
    body: JSON.stringify({ measurements: [] }),
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.error, "Invalid credentials");
  assertExists(res.headers.get("www-authenticate"));
});

Deno.test("schneider-push returns 401 with lowercase 'basic' scheme", async () => {
  const creds = btoa("wronguser:wrongpass");
  const res = await fetch(`${ENDPOINT}?action=schneider-push&tenant_id=00000000-0000-0000-0000-000000000000`, {
    method: "POST",
    body: JSON.stringify({ measurements: [] }),
    headers: {
      Authorization: `basic ${creds}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.error, "Invalid credentials");
});

Deno.test("schneider-push returns 401 with invalid base64", async () => {
  const res = await fetch(`${ENDPOINT}?action=schneider-push&tenant_id=00000000-0000-0000-0000-000000000000`, {
    method: "POST",
    body: JSON.stringify({ measurements: [] }),
    headers: {
      Authorization: "Basic %%%not-base64%%%",
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertExists(body.error);
});

Deno.test("schneider-push returns 400 without tenant_id", async () => {
  const creds = btoa("user:pass");
  const res = await fetch(`${ENDPOINT}?action=schneider-push`, {
    method: "POST",
    body: JSON.stringify({ measurements: [] }),
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "tenant_id query parameter required");
});

Deno.test("fallback routes to schneider handler with Basic Auth + tenant_id but no action", async () => {
  const creds = btoa("wronguser:wrongpass");
  const res = await fetch(`${ENDPOINT}?tenant_id=00000000-0000-0000-0000-000000000000`, {
    method: "POST",
    body: JSON.stringify({ measurements: [] }),
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  // Should hit schneider handler (auth fails → 401 with WWW-Authenticate)
  assertEquals(res.status, 401);
  assertExists(res.headers.get("www-authenticate"));
});

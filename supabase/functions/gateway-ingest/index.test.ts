import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("gateway-ingest returns 401 without API key", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gateway-ingest`, {
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
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gateway-ingest`, {
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
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gateway-ingest`, {
    method: "OPTIONS",
  });
  await res.text();
  assertEquals(res.status, 200);
  assertExists(res.headers.get("access-control-allow-origin"));
});

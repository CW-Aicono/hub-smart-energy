import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("pv-forecast returns 400 without location_id", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pv-forecast`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.text();
  assertEquals(res.status, 400);
  assertExists(body);
});

Deno.test("pv-forecast returns error for non-existent location", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pv-forecast`, {
    method: "POST",
    body: JSON.stringify({ location_id: "00000000-0000-0000-0000-000000000000" }),
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.text();
  // Should return 400 or 500 (location not found)
  assertEquals(res.ok, false);
  assertExists(body);
});

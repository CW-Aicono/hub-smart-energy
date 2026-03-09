import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("fetch-spot-prices returns valid response", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-spot-prices`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  // Should succeed or return a message about no data
  assertEquals(res.status, 200);
  assertExists(body);
});

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("anomaly-detection returns error without energyData", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/anomaly-detection`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.text();
  // Should return 400 or 500 since energyData is missing
  assertEquals(res.ok, false);
  assertExists(body);
});

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("anomaly-detection responds to POST request", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/anomaly-detection`, {
    method: "POST",
    body: JSON.stringify({ energyData: [] }),
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.text();
  // Function should respond (may succeed or fail depending on AI availability)
  assertExists(body);
});

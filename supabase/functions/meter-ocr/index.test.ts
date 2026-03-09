import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("meter-ocr returns 400 without image", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/meter-ocr`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertEquals(body.error, "No image provided");
});

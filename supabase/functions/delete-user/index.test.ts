import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;

Deno.test("delete-user returns error without auth", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
    method: "POST",
    body: JSON.stringify({ userId: "test" }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertExists(body.error);
});

Deno.test("delete-user returns error with invalid token", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
    method: "POST",
    body: JSON.stringify({ userId: "test" }),
    headers: {
      Authorization: "Bearer invalid-token",
      "Content-Type": "application/json",
    },
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertExists(body.error);
});
